import { NextRequest, NextResponse } from 'next/server';
import { normalizeSerialParagraphs } from '@/lib/editor/serial-normalizer';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { syncCharacterCatalogFromEpisode } from '@/core/memory/character-catalog-worker';

interface RouteParams {
  params: Promise<{ projectId: string; episodeId: string }>;
}

function normalizeEpisodeContent<T extends { content: string | null; char_count: number | null }>(episode: T): T {
  if (!episode.content) {
    return episode;
  }

  const normalizedContent = normalizeSerialParagraphs(episode.content);

  return {
    ...episode,
    content: normalizedContent,
    char_count: normalizedContent.length,
  };
}

// GET /api/projects/[projectId]/episodes/[episodeId] - episode detail
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, episodeId } = await params;
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
      }
      throw error;
    }

    const { data: log } = await supabase
      .from('episode_logs')
      .select('*')
      .eq('episode_id', episodeId)
      .single();

    const { data: traces } = await supabase
      .from('episode_generation_traces')
      .select('id, created_at, generation_mode, resolved_mode, status, trace_payload')
      .eq('project_id', projectId)
      .eq('target_episode_number', data.episode_number)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      episode: data ? normalizeEpisodeContent(data) : data,
      log: log || null,
      traces: traces || [],
    });
  } catch (error) {
    console.error('Episode fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch episode' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/episodes/[episodeId] - episode update
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  console.log('[Episode PATCH v3] Request received');

  try {
    const { projectId, episodeId } = await params;
    console.log('[Episode PATCH v3] Params:', { projectId, episodeId });

    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { title, content, status, originalContent } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) {
      updateData.title = title;
    }

    if (content !== undefined) {
      const normalizedContent = normalizeSerialParagraphs(String(content));
      updateData.content = normalizedContent;
      updateData.char_count = normalizedContent.length;
      updateData.log_status = 'pending';

      console.log('[Episode PATCH v3] Saving content:', {
        charCount: normalizedContent.length,
        note: 'serial paragraph normalization applied',
      });
    }

    if (originalContent !== undefined) {
      updateData.original_content = normalizeSerialParagraphs(String(originalContent));
    }

    if (status !== undefined) {
      updateData.status = status;
    }

    const { data, error } = await supabase
      .from('episodes')
      .update(updateData)
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const normalizedEpisode = data ? normalizeEpisodeContent(data) : data;

    if (content !== undefined && normalizedEpisode?.content) {
      const { error: queueError } = await supabase
        .from('episode_log_queue')
        .upsert(
          {
            episode_id: episodeId,
            project_id: projectId,
            queue_status: 'pending',
            retry_count: 0,
            max_retries: 3,
            scheduled_at: new Date().toISOString(),
            completed_at: null,
          },
          { onConflict: 'episode_id' }
        );

      if (queueError) {
        console.warn('[Episode PATCH] log queue upsert failed:', queueError);
      }

      void syncCharacterCatalogFromEpisode({
        projectId,
        episodeId,
        episodeNumber: normalizedEpisode.episode_number,
        content: normalizedEpisode.content,
      })
        .then((result) => {
          console.log('[Episode PATCH] character catalog sync:', result);
        })
        .catch((syncError) => {
          console.warn('[Episode PATCH] character catalog sync failed:', syncError);
        });
    }

    return NextResponse.json({
      episode: normalizedEpisode,
    });
  } catch (error) {
    console.error('Episode update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update episode' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/episodes/[episodeId] - episode delete
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, episodeId } = await params;
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('episodes')
      .delete()
      .eq('id', episodeId)
      .eq('project_id', projectId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Episode delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete episode' },
      { status: 500 }
    );
  }
}
