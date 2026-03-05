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

    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    let query = supabase
      .from('story_hooks')
      .select('*')
      .eq('project_id', projectId)
      .order('importance', { ascending: false })
      .order('created_in_episode_number', { ascending: true })
      .limit(limit);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: hooks, error } = await query;

    if (error) {
      console.error('Hooks fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ hooks: hooks || [] });
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
