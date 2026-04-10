import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
    // 1. 세션 확인
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('[POST /api/projects] Auth error:', authError.message, authError);
      return NextResponse.json(
        { error: '인증 오류가 발생했습니다.', details: authError.message },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('[POST /api/projects] No user session found');
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log('[POST /api/projects] Authenticated user:', user.id, user.email);

    // 2. 요청 바디 파싱
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      console.error('[POST /api/projects] JSON parse error:', parseError);
      return NextResponse.json(
        { error: '잘못된 요청 형식입니다.' },
        { status: 400 }
      );
    }

    const { title, genre, target_platform } = body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return NextResponse.json(
        { error: '프로젝트 제목은 필수입니다.' },
        { status: 400 }
      );
    }

    console.log('[POST /api/projects] Creating project:', {
      user_id: user.id,
      title: title.trim(),
      genre: genre || null,
      target_platform: target_platform || null,
    });

    // 3. 인증된 사용자 클라이언트로 프로젝트 생성 (RLS 정책 준수)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        title: title.trim(),
        genre: genre || null,
        target_platform: target_platform || null,
        generation_mode: 'claude_legacy',
        generation_config: {
          generation_mode: 'claude_legacy',
          plannerEnabled: false,
          punchupEnabled: false,
        },
        status: 'draft',
        total_episodes: 0,
      })
      .select()
      .single();

    if (projectError) {
      console.error('[POST /api/projects] DB Insert Error:', {
        message: projectError.message,
        details: projectError.details,
        hint: projectError.hint,
        code: projectError.code,
      });
      return NextResponse.json(
        {
          error: '프로젝트 생성에 실패했습니다.',
          details: projectError.message,
          code: projectError.code,
        },
        { status: 500 }
      );
    }

    console.log('[POST /api/projects] Project created:', project.id);

    // 4. 기본 World Bible 생성
    const { error: wbError } = await supabase
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
      console.error('[POST /api/projects] World Bible creation error:', {
        message: wbError.message,
        details: wbError.details,
        code: wbError.code,
      });
      // World Bible 실패해도 프로젝트는 생성되었으므로 계속 진행
    } else {
      console.log('[POST /api/projects] World Bible created for project:', project.id);
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/projects] Unexpected error:', error);

    // Supabase PostgrestError 처리
    if (error && typeof error === 'object' && 'code' in error) {
      const pgError = error as { code: string; message: string; details?: string; hint?: string };
      console.error('[POST /api/projects] PostgrestError:', {
        code: pgError.code,
        message: pgError.message,
        details: pgError.details,
        hint: pgError.hint,
      });
      return NextResponse.json(
        {
          error: pgError.message || '데이터베이스 오류가 발생했습니다.',
          code: pgError.code,
          details: pgError.details,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '프로젝트 생성 중 오류가 발생했습니다.',
      },
      { status: 500 }
    );
  }
}
