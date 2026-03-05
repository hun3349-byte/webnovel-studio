import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requestManualRetry } from '@/core/queue/log-queue-processor';

/**
 * 에피소드 로그 수동 재시도 API
 *
 * 로그 압축이 실패했거나 Fallback 로그가 생성된 경우,
 * 사용자가 수동으로 재시도를 요청할 수 있습니다.
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { episodeId } = body;

    if (!episodeId) {
      return NextResponse.json(
        { success: false, error: 'episodeId is required' },
        { status: 400 }
      );
    }

    await requestManualRetry(episodeId);

    return NextResponse.json({
      success: true,
      message: '로그 재생성이 큐에 등록되었습니다.',
    });

  } catch (error) {
    console.error('로그 재시도 오류:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    const errorDetails = error instanceof Error ? { name: error.name, stack: error.stack } : {};

    return NextResponse.json(
      { success: false, error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}
