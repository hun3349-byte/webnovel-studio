import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const sourceEpisodeNumber = Number(request.nextUrl.searchParams.get('sourceEpisodeNumber') || 0);
    const targetEpisodeNumber = Number(request.nextUrl.searchParams.get('targetEpisodeNumber') || 0);

    const db = supabase as any;
    let query = db
      .from('episode_transition_contracts')
      .select('*')
      .eq('project_id', projectId)
      .order('source_episode_number', { ascending: false })
      .limit(1);

    if (Number.isFinite(sourceEpisodeNumber) && sourceEpisodeNumber > 0) {
      query = db
        .from('episode_transition_contracts')
        .select('*')
        .eq('project_id', projectId)
        .eq('source_episode_number', sourceEpisodeNumber)
        .limit(1);
    } else if (Number.isFinite(targetEpisodeNumber) && targetEpisodeNumber > 0) {
      query = db
        .from('episode_transition_contracts')
        .select('*')
        .eq('project_id', projectId)
        .eq('target_episode_number', targetEpisodeNumber)
        .limit(1);
    }

    const { data, error } = await query;
    if (error) {
      if (String(error.message || '').toLowerCase().includes('does not exist')) {
        return NextResponse.json({ contract: null });
      }
      throw error;
    }

    return NextResponse.json({ contract: data?.[0] ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch transition contract' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const sourceEpisodeNumber = Number(body.sourceEpisodeNumber || 0);
    if (!Number.isFinite(sourceEpisodeNumber) || sourceEpisodeNumber < 1) {
      return NextResponse.json({ error: 'sourceEpisodeNumber is required.' }, { status: 400 });
    }

    const targetEpisodeNumber = Number(body.targetEpisodeNumber || sourceEpisodeNumber + 1);
    const anchor1 = String(body.anchor1 || '').trim();
    const anchor2 = String(body.anchor2 || '').trim();
    const anchor3 = String(body.anchor3 || '').trim();
    const openingGuardrail = String(body.openingGuardrail || '').trim() || null;

    const db = supabase as any;
    const { data, error } = await db
      .from('episode_transition_contracts')
      .upsert(
        {
          project_id: projectId,
          source_episode_number: sourceEpisodeNumber,
          target_episode_number: targetEpisodeNumber,
          source_episode_id: body.sourceEpisodeId || null,
          anchor_1: anchor1,
          anchor_2: anchor2,
          anchor_3: anchor3,
          opening_guardrail: openingGuardrail,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,source_episode_number' }
      )
      .select()
      .single();

    if (error) {
      if (String(error.message || '').toLowerCase().includes('does not exist')) {
        return NextResponse.json({ error: 'transition_contract_table_missing' }, { status: 503 });
      }
      throw error;
    }

    return NextResponse.json({ contract: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save transition contract' },
      { status: 500 }
    );
  }
}

