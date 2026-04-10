import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  computeNextRunAt,
  mergeGenerationConfigWithAutoWriting,
  normalizeAutoWritingConfig,
  runAutoWritingCycle,
} from '@/core/engine/auto-writing';

function isAuthorized(request: NextRequest): boolean {
  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron) return true;

  const token = request.headers.get('x-auto-writing-secret');
  const expected = process.env.AUTO_WRITING_CRON_SECRET;
  return Boolean(expected && token && token === expected);
}

async function dispatchOnce() {
  const supabase = createServiceRoleClient();
  const now = new Date();
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, generation_config');

  if (error) throw error;

  const dueProjects = (projects || []).filter((project) => {
    const baseConfig =
      project.generation_config && typeof project.generation_config === 'object'
        ? (project.generation_config as Record<string, unknown>)
        : {};
    const autoWriting = normalizeAutoWritingConfig(baseConfig.autoWriting);
    if (!autoWriting.enabled || !autoWriting.nextRunAt) return false;
    return new Date(autoWriting.nextRunAt).getTime() <= now.getTime();
  });

  const results: Array<Record<string, unknown>> = [];

  for (const project of dueProjects) {
    const baseConfig =
      project.generation_config && typeof project.generation_config === 'object'
        ? (project.generation_config as Record<string, unknown>)
        : {};
    const autoWriting = normalizeAutoWritingConfig(baseConfig.autoWriting);

    const run = await runAutoWritingCycle({
      supabase,
      projectId: project.id,
      config: autoWriting,
    });

    autoWriting.lastRunAt = new Date().toISOString();
    autoWriting.nextRunAt = computeNextRunAt(autoWriting);

    const merged = mergeGenerationConfigWithAutoWriting(baseConfig, autoWriting);
    await supabase
      .from('projects')
      .update({
        generation_config: merged as any,
        updated_at: new Date().toISOString(),
      })
      .eq('id', project.id);

    results.push({
      projectId: project.id,
      ok: run.ok,
      reason: run.reason || null,
      episodeNumber: run.episodeNumber || null,
      gptScore: run.gptReview?.score ?? null,
      geminiScore: run.geminiReview?.score ?? null,
      nextRunAt: autoWriting.nextRunAt,
    });
  }

  return {
    scannedProjects: projects?.length || 0,
    dueProjects: dueProjects.length,
    processed: results.length,
    results,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const summary = await dispatchOnce();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Auto-writing dispatch failed.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
