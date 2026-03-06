import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET: 타임라인 이벤트 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 쿼리 파라미터
    const { searchParams } = new URL(request.url);
    const episodeNumber = searchParams.get('episode');
    const status = searchParams.get('status');

    // 특정 에피소드 번호가 주어진 경우 해당 에피소드에 활성화된 이벤트만 조회
    if (episodeNumber) {
      const { data, error } = await supabase.rpc('get_active_timeline_events', {
        p_project_id: projectId,
        p_episode_number: parseInt(episodeNumber, 10),
      });

      if (error) {
        console.error('Timeline events RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ events: data || [] });
    }

    // 전체 이벤트 조회
    let query = supabase
      .from('timeline_events')
      .select('*')
      .eq('project_id', projectId)
      .order('episode_start', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Timeline events fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data || [] });
  } catch (error) {
    console.error('Timeline events API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 새 타임라인 이벤트 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();

    // 필수 필드 검증
    if (!body.event_name || !body.event_type || body.episode_start == null || body.episode_end == null) {
      return NextResponse.json(
        { error: 'event_name, event_type, episode_start, episode_end는 필수입니다.' },
        { status: 400 }
      );
    }

    // 에피소드 범위 검증
    if (body.episode_start > body.episode_end) {
      return NextResponse.json(
        { error: 'episode_start는 episode_end보다 작거나 같아야 합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('timeline_events')
      .insert({
        project_id: projectId,
        event_name: body.event_name,
        event_type: body.event_type,
        episode_start: body.episode_start,
        episode_end: body.episode_end,
        location: body.location || null,
        main_conflict: body.main_conflict || null,
        objectives: body.objectives || [],
        constraints: body.constraints || [],
        foreshadowing_seeds: body.foreshadowing_seeds || [],
        key_characters: body.key_characters || [],
        character_focus: body.character_focus || null,
        tone: body.tone || null,
        pacing: body.pacing || null,
        importance: body.importance || 5,
        notes: body.notes || null,
        status: body.status || 'planned',
      })
      .select()
      .single();

    if (error) {
      console.error('Timeline event create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ event: data }, { status: 201 });
  } catch (error) {
    console.error('Timeline events API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
