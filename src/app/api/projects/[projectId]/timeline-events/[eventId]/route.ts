import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET: 단일 타임라인 이벤트 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; eventId: string }> }
) {
  try {
    const { projectId, eventId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('timeline_events')
      .select('*')
      .eq('id', eventId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '이벤트를 찾을 수 없습니다.' }, { status: 404 });
      }
      console.error('Timeline event fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: data });
  } catch (error) {
    console.error('Timeline event API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH: 타임라인 이벤트 수정
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; eventId: string }> }
) {
  try {
    const { projectId, eventId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    // 에피소드 범위 검증 (둘 다 제공된 경우)
    if (body.episode_start != null && body.episode_end != null) {
      if (body.episode_start > body.episode_end) {
        return NextResponse.json(
          { error: 'episode_start는 episode_end보다 작거나 같아야 합니다.' },
          { status: 400 }
        );
      }
    }

    // 업데이트할 필드만 추출
    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'event_name', 'event_type', 'episode_start', 'episode_end',
      'location', 'main_conflict', 'objectives', 'constraints',
      'foreshadowing_seeds', 'key_characters', 'character_focus',
      'tone', 'pacing', 'importance', 'notes', 'status'
    ];

    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('timeline_events')
      .update(updateData)
      .eq('id', eventId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '이벤트를 찾을 수 없습니다.' }, { status: 404 });
      }
      console.error('Timeline event update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: data });
  } catch (error) {
    console.error('Timeline event API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: 타임라인 이벤트 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; eventId: string }> }
) {
  try {
    const { projectId, eventId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('timeline_events')
      .delete()
      .eq('id', eventId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Timeline event delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Timeline event API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
