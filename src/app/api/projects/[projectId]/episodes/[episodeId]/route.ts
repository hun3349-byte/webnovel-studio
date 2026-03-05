import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string; episodeId: string }>;
}

// GET /api/projects/[projectId]/episodes/[episodeId] - 에피소드 상세 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, episodeId } = await params;
    const supabase = createServiceRoleClient();

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

    // 에피소드 로그도 함께 조회
    const { data: log } = await supabase
      .from('episode_logs')
      .select('*')
      .eq('episode_id', episodeId)
      .single();

    return NextResponse.json({ episode: data, log: log || null });
  } catch (error) {
    console.error('Episode fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch episode' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/episodes/[episodeId] - 에피소드 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, episodeId } = await params;
    const body = await request.json();
    const { title, content, status } = body;

    const supabase = createServiceRoleClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (title !== undefined) updateData.title = title;
    if (content !== undefined) {
      updateData.content = content;
      updateData.char_count = content.length;
    }
    if (status !== undefined) updateData.status = status;

    const { data, error } = await supabase
      .from('episodes')
      .update(updateData)
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ episode: data });
  } catch (error) {
    console.error('Episode update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update episode' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/episodes/[episodeId] - 에피소드 삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, episodeId } = await params;
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('episodes')
      .delete()
      .eq('id', episodeId)
      .eq('project_id', projectId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Episode delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete episode' },
      { status: 500 }
    );
  }
}
