import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service Role 클라이언트 (RLS 우회)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: 타임라인 이벤트 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams?.projectId;

    // projectId 검증
    if (!projectId) {
      console.error('[TimelineEvents GET] Missing projectId');
      return NextResponse.json(
        { error: 'projectId가 필요합니다.', events: [] },
        { status: 400 }
      );
    }

    console.log('[TimelineEvents GET] Fetching for projectId:', projectId);

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
        console.error('[TimelineEvents GET] RPC error:', error);
        // RPC 함수가 없는 경우 빈 배열 반환
        if (error.message?.includes('does not exist') || error.code === '42883') {
          console.warn('[TimelineEvents GET] RPC function does not exist, returning empty array');
          return NextResponse.json({ events: [], warning: 'RPC 함수가 없습니다.' });
        }
        return NextResponse.json(
          { error: error.message, details: error, events: [] },
          { status: 500 }
        );
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
      console.error('[TimelineEvents GET] DB error:', error);
      // 테이블이 없는 경우 빈 배열 반환
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        console.warn('[TimelineEvents GET] Table does not exist, returning empty array');
        return NextResponse.json({
          events: [],
          warning: 'timeline_events 테이블이 없습니다. 마이그레이션을 실행해주세요.',
        });
      }
      return NextResponse.json(
        { error: error.message, details: error, events: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({ events: data || [] });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[TimelineEvents GET] Unexpected error:', errorMessage, errorStack);

    return NextResponse.json(
      {
        error: '타임라인 이벤트를 불러오는 중 문제가 발생했습니다.',
        details: errorMessage,
        events: [],
      },
      { status: 500 }
    );
  }
}

// POST: 새 타임라인 이벤트 생성
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const resolvedParams = await params;
    const projectId = resolvedParams?.projectId;

    // projectId 검증
    if (!projectId) {
      console.error('[TimelineEvents POST] Missing projectId');
      return NextResponse.json(
        { error: 'projectId가 필요합니다.' },
        { status: 400 }
      );
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

    console.log('[TimelineEvents POST] Creating event for projectId:', projectId);

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
      console.error('[TimelineEvents POST] DB error:', error);
      return NextResponse.json(
        { error: error.message, details: error },
        { status: 500 }
      );
    }

    return NextResponse.json({ event: data }, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TimelineEvents POST] Unexpected error:', errorMessage);

    return NextResponse.json(
      {
        error: '타임라인 이벤트 생성 중 문제가 발생했습니다.',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
