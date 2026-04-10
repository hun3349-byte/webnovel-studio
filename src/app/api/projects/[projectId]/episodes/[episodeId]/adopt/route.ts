import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { callCompressLogApi } from '@/core/queue/log-queue-processor';
import { triggerFeedbackLearning } from '@/core/style/feedback-learner';
import { normalizeSerialParagraphs } from '@/lib/editor/serial-normalizer';
import { syncCharacterCatalogFromEpisode } from '@/core/memory/character-catalog-worker';

interface RouteParams {
  params: Promise<{ projectId: string; episodeId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, episodeId } = await params;
    const body = await _request.json().catch(() => ({}));
    const inputTitle = typeof body?.title === 'string' ? body.title : undefined;
    const inputContent = typeof body?.content === 'string' ? body.content : undefined;
    const inputOriginalContent =
      typeof body?.originalContent === 'string' ? body.originalContent : undefined;

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { data: episode, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !episode) {
      return NextResponse.json({ error: 'Episode not found.' }, { status: 404 });
    }

    const content = normalizeSerialParagraphs(
      inputContent !== undefined ? inputContent : episode.content || ''
    );
    const original = normalizeSerialParagraphs(
      inputOriginalContent !== undefined
        ? inputOriginalContent
        : (episode as { original_content?: string }).original_content || ''
    );
    const charCount = content.length;
    if (charCount === 0) {
      return NextResponse.json({ error: 'Cannot adopt empty content.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('episodes')
      .update({
        title: inputTitle ?? episode.title,
        content,
        original_content: original || content,
        char_count: charCount,
        status: 'published',
        published_at: new Date().toISOString(),
        log_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', episodeId)
      .eq('project_id', projectId);

    if (updateError) throw updateError;

    const { error: queueError } = await supabase.from('episode_log_queue').insert({
      episode_id: episodeId,
      project_id: projectId,
      queue_status: 'pending',
      retry_count: 0,
      max_retries: 3,
      scheduled_at: new Date().toISOString(),
    });

    if (queueError) {
      console.warn('[Adopt] queue registration failed:', queueError);
    }

    const fallbackSummary = buildFallbackSummary(content, episode.episode_number);
    const { error: fallbackError } = await supabase
      .from('episode_logs')
      .upsert(
        {
          episode_id: episodeId,
          project_id: projectId,
          episode_number: episode.episode_number,
          summary: fallbackSummary,
          last_500_chars: content.slice(-500),
          is_fallback: true,
          raw_ai_response: null,
        },
        { onConflict: 'episode_id' }
      );

    if (fallbackError) {
      console.warn('[Adopt] fallback log upsert failed:', fallbackError);
    }

    await supabase.from('episodes').update({ log_status: 'processing' }).eq('id', episodeId);

    void callCompressLogApi(episodeId, projectId, false).catch((error) => {
      console.warn('[Adopt] compress-log failed:', error);
    });

    try {
      const characterSyncResult = await syncCharacterCatalogFromEpisode({
        projectId,
        episodeId,
        episodeNumber: episode.episode_number,
        content,
        supabaseClient: supabase,
      });
      console.log('[Adopt] character catalog sync:', characterSyncResult);
    } catch (error) {
      console.warn('[Adopt] character catalog sync failed:', error);
    }

    try {
      await saveTransitionContractAndSnapshots({
        supabase,
        projectId,
        episodeId,
        episodeNumber: episode.episode_number,
        content,
      });
    } catch (error) {
      console.warn('[Adopt] transition contract/snapshot save failed:', error);
    }

    try {
      await applyStoryHookProgression({
        supabase,
        projectId,
        episodeNumber: episode.episode_number,
        content,
      });
    } catch (error) {
      console.warn('[Adopt] hook progression failed:', error);
    }

    if (original && original !== content) {
      triggerFeedbackLearning(projectId, episode.episode_number, original, content);
    }

    return NextResponse.json({
      success: true,
      message:
        charCount < 4000
          ? 'Episode adopted below recommended length (4,000). Log compression, character sync, and learning tasks started.'
          : 'Episode adopted. Log compression, character sync, and learning tasks started.',
      episode: {
        id: episodeId,
        episode_number: episode.episode_number,
        status: 'published',
        log_status: 'processing',
      },
      lengthAdvisory:
        charCount < 4000
          ? {
              recommendedMin: 4000,
              current: charCount,
              warning: 'Adopted under recommended minimum length.',
            }
          : null,
    });
  } catch (error) {
    console.error('[Adopt] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to adopt episode' },
      { status: 500 }
    );
  }
}

function buildFallbackSummary(content: string, episodeNumber: number) {
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  const preview = lines.slice(0, 3).join(' / ');
  return `[${episodeNumber}화|fallback]\n길이: ${content.length}\n요약: ${preview}\n엔딩: ${content.slice(-120)}`;
}

function splitParagraphs(content: string): string[] {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function extractTransitionAnchors(content: string): {
  anchor1: string;
  anchor2: string;
  anchor3: string;
  openingGuardrail: string;
} {
  const paragraphs = splitParagraphs(content);
  const last = paragraphs[paragraphs.length - 1] || '';
  const prev = paragraphs[paragraphs.length - 2] || '';
  const prev2 = paragraphs[paragraphs.length - 3] || '';

  return {
    anchor1: prev2.slice(0, 260).trim(),
    anchor2: prev.slice(0, 260).trim(),
    anchor3: last.slice(0, 260).trim(),
    openingGuardrail:
      '다음 화 오프닝 400자 안에서 직전 화 마지막 장면의 장소/감정/직전 행동 결과를 반드시 이어서 시작한다.',
  };
}

async function saveTransitionContractAndSnapshots(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  projectId: string;
  episodeId: string;
  episodeNumber: number;
  content: string;
}) {
  const { supabase, projectId, episodeId, episodeNumber, content } = params;
  const db = supabase as any;

  const anchors = extractTransitionAnchors(content);
  await db
    .from('episode_transition_contracts')
    .upsert(
      {
        project_id: projectId,
        source_episode_id: episodeId,
        source_episode_number: episodeNumber,
        target_episode_number: episodeNumber + 1,
        anchor_1: anchors.anchor1,
        anchor_2: anchors.anchor2,
        anchor_3: anchors.anchor3,
        opening_guardrail: anchors.openingGuardrail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id,source_episode_number' }
    );

  const { data: activeCharacters } = await supabase
    .from('characters')
    .select('name, role, current_location, emotional_state, injuries, possessed_items')
    .eq('project_id', projectId)
    .eq('is_alive', true);

  const snapshots = (activeCharacters || []).map((char) => ({
    name: char.name,
    role: char.role,
    location: char.current_location,
    emotionalState: char.emotional_state,
    injuries: char.injuries || [],
    possessedItems: char.possessed_items || [],
  }));

  await db
    .from('episode_character_snapshots')
    .upsert(
      {
        project_id: projectId,
        episode_id: episodeId,
        episode_number: episodeNumber,
        snapshots,
      },
      { onConflict: 'project_id,episode_number' }
    );
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z\uac00-\ud7a3\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textIncludesHook(
  content: string,
  hook: { summary: string; keywords?: string[] | null }
) {
  const normalizedText = normalizeForMatch(content);
  const summaryTokens = normalizeForMatch(hook.summary)
    .split(' ')
    .filter((token) => token.length >= 2)
    .slice(0, 6);
  const keywordTokens = (hook.keywords || [])
    .map((keyword) => normalizeForMatch(String(keyword)))
    .filter(Boolean);

  const summaryHit = summaryTokens.filter((token) => normalizedText.includes(token)).length;
  if (summaryHit >= Math.max(2, Math.floor(summaryTokens.length * 0.5))) return true;
  return keywordTokens.some((token) => token.length >= 2 && normalizedText.includes(token));
}

async function applyStoryHookProgression(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  projectId: string;
  episodeNumber: number;
  content: string;
}) {
  const { supabase, projectId, episodeNumber, content } = params;
  const { data: hooks } = await supabase
    .from('story_hooks')
    .select('id, status, summary, keywords')
    .eq('project_id', projectId)
    .in('status', ['open', 'hinted', 'escalated', 'partially_resolved'])
    .order('importance', { ascending: false })
    .limit(20);

  for (const hook of hooks || []) {
    if (!textIncludesHook(content, hook)) continue;

    const nextStatus =
      hook.status === 'open'
        ? 'hinted'
        : hook.status === 'hinted'
          ? 'escalated'
          : 'resolved';

    const patch: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === 'resolved') {
      patch.resolved_in_episode_number = episodeNumber;
    }

    await supabase
      .from('story_hooks')
      .update(patch)
      .eq('id', hook.id)
      .eq('project_id', projectId);
  }
}
