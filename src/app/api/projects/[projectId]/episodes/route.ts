import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/episodes - 에피소드 목록 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('episodes')
      .select('id, episode_number, title, char_count, status, log_status, created_at, updated_at, published_at')
      .eq('project_id', projectId)
      .order('episode_number', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ episodes: data });
  } catch (error) {
    console.error('Episodes fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch episodes' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/episodes - 새 에피소드 생성 (빈 에피소드)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { title, content } = body;

    const supabase = createServiceRoleClient();

    // 다음 에피소드 번호 계산
    const { data: lastEpisode } = await supabase
      .from('episodes')
      .select('episode_number')
      .eq('project_id', projectId)
      .order('episode_number', { ascending: false })
      .limit(1)
      .single();

    const nextEpisodeNumber = (lastEpisode?.episode_number || 0) + 1;

    const { data, error } = await supabase
      .from('episodes')
      .insert({
        project_id: projectId,
        episode_number: nextEpisodeNumber,
        title: title || `${nextEpisodeNumber}화`,
        content: content || '',
        char_count: content?.length || 0,
        status: 'draft',
        log_status: 'pending',
        log_retry_count: 0,
      })
      .select()
      .single();

    if (error) throw error;

    // 프로젝트의 total_episodes 업데이트
    await supabase
      .from('projects')
      .update({ total_episodes: nextEpisodeNumber, updated_at: new Date().toISOString() })
      .eq('id', projectId);

    return NextResponse.json({ episode: data }, { status: 201 });
  } catch (error) {
    console.error('Episode creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create episode' },
      { status: 500 }
    );
  }
}
