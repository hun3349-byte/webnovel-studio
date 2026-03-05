import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';

// GET /api/projects - 프로젝트 목록 조회 (로그인한 사용자의 프로젝트만)
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();

    // 현재 로그인한 사용자 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    // 해당 사용자의 프로젝트만 조회
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ projects: data });
  } catch (error) {
    console.error('Projects fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// POST /api/projects - 새 프로젝트 생성
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // 현재 로그인한 사용자 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, genre, target_platform } = body;

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    // Service Role 클라이언트로 프로젝트 생성 (RLS 우회)
    const serviceClient = createServiceRoleClient();

    // 프로젝트 생성 (현재 사용자 ID 사용)
    const { data: project, error: projectError } = await serviceClient
      .from('projects')
      .insert({
        user_id: user.id,
        title,
        genre: genre || null,
        target_platform: target_platform || null,
        status: 'draft',
        total_episodes: 0,
      })
      .select()
      .single();

    if (projectError) throw projectError;

    // 기본 World Bible 생성
    const { error: wbError } = await serviceClient
      .from('world_bibles')
      .insert({
        project_id: project.id,
        world_name: null,
        time_period: null,
        geography: null,
        power_system_name: null,
        power_system_ranks: [],
        power_system_rules: null,
        absolute_rules: [],
        forbidden_elements: [],
        additional_settings: {},
        version: 1,
      });

    if (wbError) {
      console.error('World Bible creation error:', wbError);
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('Project creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create project' },
      { status: 500 }
    );
  }
}
