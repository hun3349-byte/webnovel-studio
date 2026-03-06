import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { callCompressLogApi } from '@/core/queue/log-queue-processor';

interface RouteParams {
  params: Promise<{ projectId: string; episodeId: string }>;
}

/**
 * POST /api/projects/[projectId]/episodes/[episodeId]/adopt
 *
 * 에피소드 [채택] - 가장 중요한 엔드포인트
 * 1. 에피소드 상태를 'published'로 변경
 * 2. 로그 생성 큐에 등록 (백그라운드에서 로그 압축 수행)
 * 3. 다음 화 집필을 위한 Memory Pipeline 시작
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  console.log('[Adopt API v2] Request received'); // 버전 표시로 캐시 갱신 확인

  try {
    const { projectId, episodeId } = await params;
    console.log('[Adopt API v2] Params:', { projectId, episodeId });

    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('[Adopt API v2] Auth error:', authError);
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    console.log('[Adopt API v2] User authenticated:', user.id);

    // 1. 에피소드 조회
    const { data: episode, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // 2. 최소 안전 검증 (완전히 빈 콘텐츠만 차단)
    const charCount = episode.content?.length || 0;
    if (charCount === 0) {
      return NextResponse.json(
        { error: '에피소드 내용이 비어있습니다.' },
        { status: 400 }
      );
    }
    // 분량 제한 없음 - 몇 자든 채택 허용
    console.log(`[Adopt] 에피소드 채택: ${charCount}자`);

    // 3. 에피소드 상태 업데이트 (published)
    const { error: updateError } = await supabase
      .from('episodes')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        log_status: 'pending', // 로그 생성 대기
        updated_at: new Date().toISOString(),
      })
      .eq('id', episodeId);

    if (updateError) throw updateError;

    // 4. 로그 생성 큐에 등록
    const { error: queueError } = await supabase
      .from('episode_log_queue')
      .insert({
        episode_id: episodeId,
        project_id: projectId,
        queue_status: 'pending',
        retry_count: 0,
        max_retries: 3,
        scheduled_at: new Date().toISOString(),
      });

    if (queueError) {
      console.error('Queue registration error:', queueError);
      // 큐 등록 실패해도 채택은 성공으로 처리 (fallback 로그 사용)
    }

    // 5. Fallback 로그 즉시 생성 (AI 로그 생성 실패 대비)
    // 마지막 500자 추출
    const last500Chars = episode.content?.slice(-500) || '';

    // 간단한 요약 생성 (실제로는 AI가 하지만 fallback용)
    const fallbackSummary = generateFallbackSummary(episode.content || '', episode.episode_number);

    const { error: logError } = await supabase
      .from('episode_logs')
      .upsert({
        episode_id: episodeId,
        project_id: projectId,
        episode_number: episode.episode_number,
        summary: fallbackSummary,
        last_500_chars: last500Chars,
        is_fallback: true, // AI 로그로 대체될 때까지 fallback 표시
        raw_ai_response: null,
      }, {
        onConflict: 'episode_id',
      });

    if (logError) {
      console.error('Fallback log creation error:', logError);
    }

    // 6. 에피소드 로그 상태 업데이트
    await supabase
      .from('episodes')
      .update({ log_status: 'processing' })
      .eq('id', episodeId);

    // 7. 즉시 AI 로그 압축 시도 (백그라운드)
    // 성공하면 fallback 로그가 AI 로그로 대체됨
    // 실패해도 fallback 로그가 있으므로 안전
    callCompressLogApi(episodeId, projectId, false)
      .then((result) => {
        if (!result.success) {
          console.warn('Initial log compression failed, will retry via queue:', result.error);
        }
      })
      .catch((err) => {
        console.error('Log compression error:', err);
      });

    return NextResponse.json({
      success: true,
      message: '에피소드가 채택되었습니다. AI 로그 생성이 진행 중입니다.',
      episode: {
        id: episodeId,
        episode_number: episode.episode_number,
        status: 'published',
        log_status: 'processing',
      },
    });
  } catch (error) {
    console.error('Episode adopt error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to adopt episode' },
      { status: 500 }
    );
  }
}

/**
 * Fallback 요약 생성 (AI 실패 시 사용)
 */
function generateFallbackSummary(content: string, episodeNumber: number): string {
  // 간단한 규칙 기반 요약 (AI 대체용)
  const lines = content.split('\n').filter(line => line.trim());
  const dialogues = lines.filter(line => line.includes('"')).slice(0, 3);

  let summary = `[${episodeNumber}화 임시 요약]\n`;
  summary += `분량: ${content.length}자\n`;

  if (dialogues.length > 0) {
    summary += `주요 대사:\n`;
    dialogues.forEach(d => {
      const trimmed = d.length > 50 ? d.substring(0, 50) + '...' : d;
      summary += `- ${trimmed}\n`;
    });
  }

  // 첫 100자와 마지막 100자로 시작/끝 힌트
  summary += `\n[시작] ${content.substring(0, 100)}...\n`;
  summary += `[끝] ...${content.substring(content.length - 100)}`;

  return summary;
}
