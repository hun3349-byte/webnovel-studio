import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// GET: 프로젝트의 에피소드 로그 목록 조회 (슬라이딩 윈도우용)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '3');
    const beforeEpisode = searchParams.get('before'); // 특정 에피소드 이전의 로그만

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('episode_logs')
      .select('episode_number, summary, last_500_chars, is_fallback')
      .eq('project_id', projectId)
      .order('episode_number', { ascending: false })
      .limit(limit);

    if (beforeEpisode) {
      query = query.lt('episode_number', parseInt(beforeEpisode));
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error('Episode logs fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: logs || [] });
  } catch (error) {
    console.error('Episode logs API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
