import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// GET: 프로젝트의 떡밥 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'open';
    const limit = parseInt(searchParams.get('limit') || '10');
    const episodeNumberRaw = searchParams.get('episodeNumber');
    const episodeNumber = episodeNumberRaw ? Number(episodeNumberRaw) : null;

    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    let query = supabase
      .from('story_hooks')
      .select('*')
      .eq('project_id', projectId);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // Current-episode authoring should not be distracted by future hooks.
    if (Number.isFinite(episodeNumber) && episodeNumber !== null) {
      query = query.lte('created_in_episode_number', episodeNumber);
    }

    // Fetch enough rows first, then compute episode-aware ranking in memory.
    query = query
      .order('created_in_episode_number', { ascending: false })
      .order('importance', { ascending: false })
      .limit(Math.max(limit * 3, 50));

    const { data: hooks, error } = await query;

    if (error) {
      console.error('Hooks fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rankHook = (hook: {
      importance: number | null;
      created_in_episode_number: number;
    }) => {
      const importance = hook.importance ?? 5;
      const distance =
        Number.isFinite(episodeNumber) && episodeNumber !== null
          ? Math.max(0, episodeNumber - hook.created_in_episode_number)
          : 0;

      return importance * 100 - distance * 5 + hook.created_in_episode_number * 0.01;
    };

    const rankedHooks = (hooks || [])
      .slice()
      .sort((a, b) => rankHook(b) - rankHook(a))
      .slice(0, limit);

    return NextResponse.json({ hooks: rankedHooks });
  } catch (error) {
    console.error('Hooks API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 새 떡밥 생성
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

    const { data: hook, error } = await supabase
      .from('story_hooks')
      .insert({
        project_id: projectId,
        hook_type: body.hook_type || 'foreshadowing',
        summary: body.summary,
        detail: body.detail,
        keywords: body.keywords || [],
        related_character_ids: body.related_character_ids || [],
        created_in_episode_number: body.created_in_episode_number,
        importance: body.importance || 5,
        status: body.status || 'open',
      })
      .select()
      .single();

    if (error) {
      console.error('Hook create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ hook }, { status: 201 });
  } catch (error) {
    console.error('Hook create API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
