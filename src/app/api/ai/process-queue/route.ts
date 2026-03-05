import { NextRequest, NextResponse } from 'next/server';
import { processAllPendingItems } from '@/core/queue/log-queue-processor';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/ai/process-queue
 *
 * 로그 생성 큐 처리 API
 * - 대기 중인 큐 아이템들을 처리
 * - Cron Job 또는 수동으로 호출
 * - Vercel Cron, Railway Cron, 또는 외부 서비스에서 호출 가능
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { useMock = false, secret } = body;

    // 간단한 인증 (선택적)
    const expectedSecret = process.env.QUEUE_PROCESSOR_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 워커 ID 생성 (동시 실행 방지용)
    const workerId = `worker-${uuidv4().substring(0, 8)}`;

    // 큐 처리
    const result = await processAllPendingItems(workerId, useMock);

    return NextResponse.json({
      success: true,
      workerId,
      ...result,
      message: `처리 완료: ${result.succeeded}개 성공, ${result.failed}개 실패`,
    });
  } catch (error) {
    console.error('Queue processing error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Queue processing failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/process-queue
 *
 * 큐 상태 조회 (디버깅용)
 */
export async function GET() {
  try {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server');
    const supabase = await createServerSupabaseClient();

    const { data: pendingItems, error } = await supabase
      .from('episode_log_queue')
      .select('id, episode_id, queue_status, retry_count, last_error, scheduled_at')
      .in('queue_status', ['pending', 'processing', 'failed'])
      .order('scheduled_at', { ascending: true })
      .limit(20);

    if (error) {
      throw error;
    }

    const statusCounts = {
      pending: pendingItems?.filter(i => i.queue_status === 'pending').length || 0,
      processing: pendingItems?.filter(i => i.queue_status === 'processing').length || 0,
      failed: pendingItems?.filter(i => i.queue_status === 'failed').length || 0,
    };

    return NextResponse.json({
      success: true,
      counts: statusCounts,
      items: pendingItems,
    });
  } catch (error) {
    console.error('Queue status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get queue status',
      },
      { status: 500 }
    );
  }
}
