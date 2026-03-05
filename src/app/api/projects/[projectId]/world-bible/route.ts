import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// GET /api/projects/[projectId]/world-bible - World Bible 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('world_bibles')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'World Bible not found' }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ worldBible: data });
  } catch (error) {
    console.error('World Bible fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch World Bible' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/world-bible - World Bible 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      world_name,
      time_period,
      geography,
      power_system_name,
      power_system_ranks,
      power_system_rules,
      absolute_rules,
      forbidden_elements,
      additional_settings,
    } = body;

    // 현재 버전 조회
    const { data: current, error: fetchError } = await supabase
      .from('world_bibles')
      .select('version')
      .eq('project_id', projectId)
      .single();

    if (fetchError) throw fetchError;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      version: (current?.version || 0) + 1,
    };

    if (world_name !== undefined) updateData.world_name = world_name;
    if (time_period !== undefined) updateData.time_period = time_period;
    if (geography !== undefined) updateData.geography = geography;
    if (power_system_name !== undefined) updateData.power_system_name = power_system_name;
    if (power_system_ranks !== undefined) updateData.power_system_ranks = power_system_ranks;
    if (power_system_rules !== undefined) updateData.power_system_rules = power_system_rules;
    if (absolute_rules !== undefined) updateData.absolute_rules = absolute_rules;
    if (forbidden_elements !== undefined) updateData.forbidden_elements = forbidden_elements;
    if (additional_settings !== undefined) updateData.additional_settings = additional_settings;

    const { data, error } = await supabase
      .from('world_bibles')
      .update(updateData)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ worldBible: data });
  } catch (error) {
    console.error('World Bible update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update World Bible' },
      { status: 500 }
    );
  }
}
