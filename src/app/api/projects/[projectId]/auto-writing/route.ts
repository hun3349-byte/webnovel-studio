import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeNextRunAt,
  mergeGenerationConfigWithAutoWriting,
  normalizeAutoWritingConfig,
  runAutoWritingCycle,
} from '@/core/engine/auto-writing';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, generation_config')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[auto-writing GET] projectError:', projectError);
      return NextResponse.json({ error: 'Project query failed.' }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    // user_id 체크 완화: null이거나 일치하면 통과
    if (project.user_id && project.user_id !== user.id) {
      console.warn('[auto-writing GET] user mismatch:', { projectUserId: project.user_id, currentUserId: user.id });
      return NextResponse.json({ error: 'Not authorized for this project.' }, { status: 403 });
    }

    const generationConfig =
      project.generation_config && typeof project.generation_config === 'object'
        ? (project.generation_config as Record<string, unknown>)
        : {};
    const autoWriting = normalizeAutoWritingConfig(generationConfig.autoWriting);

    return NextResponse.json({ autoWriting });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch auto writing config.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, generation_config')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[auto-writing PATCH] projectError:', projectError);
      return NextResponse.json({ error: 'Project query failed.' }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    if (project.user_id && project.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized for this project.' }, { status: 403 });
    }

    const body = (await request.json()) as Partial<{
      enabled: boolean;
      startTime: string;
      runsPerDay: number;
      timezone: string;
      instructionTemplate: string;
    }>;

    const generationConfig =
      project.generation_config && typeof project.generation_config === 'object'
        ? (project.generation_config as Record<string, unknown>)
        : {};
    const current = normalizeAutoWritingConfig(generationConfig.autoWriting);
    const next = normalizeAutoWritingConfig({
      ...current,
      ...body,
      nextRunAt:
        typeof body.enabled === 'boolean'
          ? body.enabled
            ? current.nextRunAt
            : null
          : current.nextRunAt,
    });

    if (next.enabled) {
      next.nextRunAt = computeNextRunAt(next);
    } else {
      next.nextRunAt = null;
    }

    const mergedConfig = mergeGenerationConfigWithAutoWriting(generationConfig, next);
    const { data: updated, error: updateError } = await supabase
      .from('projects')
      .update({
        generation_config: mergedConfig as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select('generation_config')
      .single();

    if (updateError) {
      throw updateError;
    }

    const refreshedConfig =
      updated.generation_config && typeof updated.generation_config === 'object'
        ? (updated.generation_config as Record<string, unknown>)
        : {};

    return NextResponse.json({
      autoWriting: normalizeAutoWritingConfig(refreshedConfig.autoWriting),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update auto writing config.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, generation_config')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[auto-writing POST] projectError:', projectError);
      return NextResponse.json({ error: 'Project query failed.' }, { status: 500 });
    }
    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }
    if (project.user_id && project.user_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized for this project.' }, { status: 403 });
    }

    const body = (await request.json()) as { action?: 'run_now' };
    if (body.action !== 'run_now') {
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
    }

    const generationConfig =
      project.generation_config && typeof project.generation_config === 'object'
        ? (project.generation_config as Record<string, unknown>)
        : {};
    const config = normalizeAutoWritingConfig(generationConfig.autoWriting);

    const service = createServiceRoleClient();
    const runResult = await runAutoWritingCycle({
      supabase: service,
      projectId,
      config,
    });

    const nextConfig = normalizeAutoWritingConfig(config);
    nextConfig.lastRunAt = new Date().toISOString();
    if (nextConfig.enabled) {
      nextConfig.nextRunAt = computeNextRunAt(nextConfig);
    }

    const mergedConfig = mergeGenerationConfigWithAutoWriting(generationConfig, nextConfig);
    await supabase
      .from('projects')
      .update({
        generation_config: mergedConfig as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    return NextResponse.json({
      ok: runResult.ok,
      result: runResult,
      autoWriting: nextConfig,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to run auto writing.' },
      { status: 500 }
    );
  }
}
