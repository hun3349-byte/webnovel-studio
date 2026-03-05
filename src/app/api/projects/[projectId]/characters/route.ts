import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/characters - 캐릭터 목록 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ characters: data });
  } catch (error) {
    console.error('Characters fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch characters' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/characters - 새 캐릭터 생성
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      role,
      age,
      gender,
      appearance,
      personality,
      speech_pattern,
      backstory,
      goals,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('characters')
      .insert({
        project_id: projectId,
        name,
        role: role || null,
        age: age || null,
        gender: gender || null,
        appearance: appearance || null,
        personality: personality || null,
        speech_pattern: speech_pattern || null,
        backstory: backstory || null,
        goals: goals || [],
        is_alive: true,
        current_location: null,
        emotional_state: null,
        possessed_items: [],
        injuries: [],
        status_effects: [],
        additional_data: {},
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ character: data }, { status: 201 });
  } catch (error) {
    console.error('Character creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create character' },
      { status: 500 }
    );
  }
}
