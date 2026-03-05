import { createServiceRoleClient } from '@/lib/supabase/server';
import type { LogQueueItem } from '@/types/memory';
import type { Json } from '@/types/database';

/**
 * 에피소드 로그 생성 큐 처리기
 *
 * 트랜잭션 보장:
 * 1. 에피소드 저장 시 자동으로 큐에 등록됨 (DB 트리거)
 * 2. 이 프로세서가 큐를 처리하여 로그 생성
 * 3. 실패 시 재시도 또는 Fallback 로그 생성
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

/**
 * 로그 압축 API 호출 URL
 */
const getCompressLogUrl = () => {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/ai/compress-log`;
};

/**
 * 대기 중인 큐 아이템 가져오기
 */
export async function fetchPendingQueueItems(limit: number = 10): Promise<LogQueueItem[]> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from('episode_log_queue')
    .select('*')
    .in('queue_status', ['pending', 'failed'])
    .lt('retry_count', MAX_RETRIES)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`큐 조회 실패: ${error.message}`);
  }

  return (data || []).map(item => ({
    id: item.id,
    episodeId: item.episode_id,
    projectId: item.project_id,
    queueStatus: item.queue_status as LogQueueItem['queueStatus'],
    retryCount: item.retry_count ?? 0,
    maxRetries: item.max_retries ?? MAX_RETRIES,
    lastError: item.last_error,
  }));
}

/**
 * 큐 아이템 처리 시작 (락 획득)
 */
export async function startProcessingQueueItem(
  queueItemId: string,
  workerId: string
): Promise<boolean> {
  const supabase = createServiceRoleClient();

  // 낙관적 락: queue_status가 아직 pending/failed인 경우만 업데이트
  const { data, error } = await supabase
    .from('episode_log_queue')
    .update({
      queue_status: 'processing',
      started_at: new Date().toISOString(),
      worker_id: workerId,
    })
    .eq('id', queueItemId)
    .in('queue_status', ['pending', 'failed'])
    .select()
    .single();

  if (error || !data) {
    // 다른 워커가 이미 처리 중
    return false;
  }

  // 에피소드 log_status도 업데이트
  await supabase
    .from('episodes')
    .update({ log_status: 'processing' })
    .eq('id', data.episode_id);

  return true;
}

/**
 * 큐 아이템 처리 완료
 */
export async function completeQueueItem(queueItemId: string, episodeId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  await Promise.all([
    supabase
      .from('episode_log_queue')
      .update({
        queue_status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', queueItemId),

    supabase
      .from('episodes')
      .update({ log_status: 'completed' })
      .eq('id', episodeId),
  ]);
}

/**
 * 큐 아이템 처리 실패
 */
export async function failQueueItem(
  queueItemId: string,
  episodeId: string,
  errorMessage: string,
  retryCount: number
): Promise<void> {
  const supabase = createServiceRoleClient();

  const newRetryCount = retryCount + 1;
  const isFinalFailure = newRetryCount >= MAX_RETRIES;

  await Promise.all([
    supabase
      .from('episode_log_queue')
      .update({
        queue_status: isFinalFailure ? 'failed' : 'pending',
        retry_count: newRetryCount,
        last_error: errorMessage,
        scheduled_at: isFinalFailure
          ? undefined
          : new Date(Date.now() + RETRY_DELAY_MS * newRetryCount).toISOString(),
      })
      .eq('id', queueItemId),

    supabase
      .from('episodes')
      .update({
        log_status: 'failed',
        log_retry_count: newRetryCount,
        log_last_error: errorMessage,
      })
      .eq('id', episodeId),
  ]);
}

/**
 * Fallback 로그 생성 (최종 실패 시)
 */
export async function createFallbackLog(
  episodeId: string,
  projectId: string,
  episodeNumber: number,
  content: string
): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc('create_fallback_episode_log', {
    p_episode_id: episodeId,
    p_project_id: projectId,
    p_episode_number: episodeNumber,
    p_content: content,
  });

  if (error) {
    throw new Error(`Fallback 로그 생성 실패: ${error.message}`);
  }

  // 큐 상태도 completed로 업데이트 (Fallback이지만 처리 완료)
  await supabase
    .from('episode_log_queue')
    .update({
      queue_status: 'completed',
      completed_at: new Date().toISOString(),
      last_error: 'Fallback 로그로 대체됨',
    })
    .eq('episode_id', episodeId);

  return data as string;
}

/**
 * 수동 재시도 요청
 */
export async function requestManualRetry(episodeId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  // 기존 큐 아이템 찾기
  const { data: existingQueue } = await supabase
    .from('episode_log_queue')
    .select('id')
    .eq('episode_id', episodeId)
    .single();

  if (existingQueue) {
    // 기존 큐 아이템 재활성화
    await supabase
      .from('episode_log_queue')
      .update({
        queue_status: 'pending',
        retry_count: 0,
        scheduled_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', existingQueue.id);
  } else {
    // 새 큐 아이템 생성
    const { data: episode } = await supabase
      .from('episodes')
      .select('project_id')
      .eq('id', episodeId)
      .single();

    if (episode) {
      await supabase.from('episode_log_queue').insert({
        episode_id: episodeId,
        project_id: episode.project_id,
      });
    }
  }

  // 에피소드 상태 업데이트
  await supabase
    .from('episodes')
    .update({
      log_status: 'pending',
      log_retry_count: 0,
      log_last_error: null,
    })
    .eq('id', episodeId);
}

/**
 * Fallback 로그를 정상 로그로 교체
 */
export async function replaceFallbackLog(
  episodeId: string,
  newLogData: {
    summary: string;
    last500Chars: string;
    rawAiResponse?: Json;
  }
): Promise<void> {
  const supabase = createServiceRoleClient();

  await Promise.all([
    supabase
      .from('episode_logs')
      .update({
        summary: newLogData.summary,
        last_500_chars: newLogData.last500Chars,
        is_fallback: false,
        raw_ai_response: newLogData.rawAiResponse ?? null,
      })
      .eq('episode_id', episodeId),

    supabase
      .from('episodes')
      .update({ log_status: 'completed' })
      .eq('id', episodeId),
  ]);
}

/**
 * 로그 압축 API 호출
 */
export async function callCompressLogApi(
  episodeId: string,
  projectId: string,
  useMock: boolean = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(getCompressLogUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodeId, projectId, useMock }),
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error || 'API call failed' };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 단일 큐 아이템 처리
 */
export async function processQueueItem(
  item: LogQueueItem,
  workerId: string,
  useMock: boolean = false
): Promise<{ success: boolean; error?: string }> {
  // 1. 처리 시작 (락 획득)
  const acquired = await startProcessingQueueItem(item.id, workerId);
  if (!acquired) {
    return { success: false, error: 'Could not acquire lock' };
  }

  // 2. 로그 압축 API 호출
  const result = await callCompressLogApi(item.episodeId, item.projectId, useMock);

  if (result.success) {
    // 3. 성공 처리
    await completeQueueItem(item.id, item.episodeId);
    return { success: true };
  } else {
    // 4. 실패 처리
    await failQueueItem(
      item.id,
      item.episodeId,
      result.error || 'Unknown error',
      item.retryCount
    );
    return { success: false, error: result.error };
  }
}

/**
 * 대기 중인 모든 큐 아이템 처리 (배치)
 */
export async function processAllPendingItems(
  workerId: string,
  useMock: boolean = false
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const items = await fetchPendingQueueItems(10);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    const result = await processQueueItem(item, workerId, useMock);
    processed++;

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }

    // 연속 실패 시 잠시 대기
    if (failed > 3) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  return { processed, succeeded, failed };
}
