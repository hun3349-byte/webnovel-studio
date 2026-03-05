import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET: 특정 Writing Memory 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memoryId: string }> }
) {
  try {
    const { projectId, memoryId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: memory, error } = await supabase
      .from('writing_memories')
      .select('*')
      .eq('id', memoryId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      console.error('Writing memory fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!memory) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    return NextResponse.json({ memory });
  } catch (error) {
    console.error('Writing memory API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: Writing Memory 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memoryId: string }> }
) {
  try {
    const { projectId, memoryId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // 업데이트 가능한 필드들
    if (body.preference_summary !== undefined) updateData.preference_summary = body.preference_summary;
    if (body.avoid_patterns !== undefined) updateData.avoid_patterns = body.avoid_patterns;
    if (body.favor_patterns !== undefined) updateData.favor_patterns = body.favor_patterns;
    if (body.confidence !== undefined) updateData.confidence = body.confidence;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.applied_count !== undefined) updateData.applied_count = body.applied_count;

    const { data: memory, error } = await supabase
      .from('writing_memories')
      .update(updateData)
      .eq('id', memoryId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      console.error('Writing memory update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memory });
  } catch (error) {
    console.error('Writing memory update API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Writing Memory 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; memoryId: string }> }
) {
  try {
    const { projectId, memoryId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('writing_memories')
      .delete()
      .eq('id', memoryId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Writing memory delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Writing memory delete API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
