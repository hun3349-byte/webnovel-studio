import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeNextRunAt,
  mergeGenerationConfigWithAutoWriting,
  normalizeAutoWritingConfig,
  runAutoWritingCycle,
} from '@/core/engine/auto-writing';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

function isProjectNotFoundError(error: { code?: string | null } | null | undefined): boolean {
  return String(error?.code || '') === 'PGRST116';
}

function isMissingGenerationConfigColumnError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
} | null | undefined): boolean {
  if (String(error?.code || '').toUpperCase() !== '42703') return false;
  const text = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return text.includes('generation_config');
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    // Service role client로 RLS 우회
    const supabase = createServiceRoleClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, generation_config')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[auto-writing GET] projectError:', projectError);
      if (isProjectNotFoundError(projectError)) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
      if (isMissingGenerationConfigColumnError(projectError)) {
        return NextResponse.json({
          autoWriting: normalizeAutoWritingConfig(undefined),
          unsupported: true,
          reason: 'generation_config_column_missing',
        });
      }
      return NextResponse.json(
        {
          error: 'Failed to load auto writing config.',
          details: projectError.message,
          code: projectError.code,
        },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
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
    const supabase = createServiceRoleClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, generation_config')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[auto-writing PATCH] projectError:', projectError);
      if (isProjectNotFoundError(projectError)) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
      if (isMissingGenerationConfigColumnError(projectError)) {
        return NextResponse.json(
          {
            error: 'auto_writing_unavailable',
            reason: 'generation_config_column_missing',
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error: 'Failed to load auto writing config.',
          details: projectError.message,
          code: projectError.code,
        },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
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
    const supabase = createServiceRoleClient();

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, generation_config')
      .eq('id', projectId)
      .single();

    if (projectError) {
      console.error('[auto-writing POST] projectError:', projectError);
      if (isProjectNotFoundError(projectError)) {
        return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      }
      if (isMissingGenerationConfigColumnError(projectError)) {
        return NextResponse.json(
          {
            error: 'auto_writing_unavailable',
            reason: 'generation_config_column_missing',
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error: 'Failed to load auto writing config.',
          details: projectError.message,
          code: projectError.code,
        },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
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
