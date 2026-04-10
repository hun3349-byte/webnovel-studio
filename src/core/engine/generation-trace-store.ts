import { createServiceRoleClient } from '@/lib/supabase/server';
import type { EpisodeGenerationTrace } from '@/types/generation';

export interface SaveGenerationTraceParams {
  projectId: string;
  episodeId?: string | null;
  targetEpisodeNumber: number;
  userInstruction: string;
  trace: EpisodeGenerationTrace;
  finalContent: string;
}

export async function saveGenerationTrace(
  params: SaveGenerationTraceParams
): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { trace } = params;

  const plannerStage = trace.stages.find((stage) => stage.stage === 'planner');
  const proseStage = trace.stages.find((stage) => stage.stage === 'prose');
  const punchupStage = trace.stages.find((stage) => stage.stage === 'punchup');

  const { data, error } = await supabase
    .from('episode_generation_traces')
    .insert({
      project_id: params.projectId,
      episode_id: params.episodeId || null,
      target_episode_number: params.targetEpisodeNumber,
      generation_mode: trace.route.requestedMode,
      resolved_mode: trace.route.resolvedMode,
      planner_model: trace.route.plannerModel,
      prose_model: trace.route.proseModel,
      punchup_model: trace.route.punchupModel,
      request_instruction: params.userInstruction,
      planner_output: trace.plannerOutput || null,
      prose_output: proseStage?.hiddenOutput || null,
      punchup_output: punchupStage?.hiddenOutput
        ? { output: punchupStage.hiddenOutput }
        : null,
      final_content: params.finalContent,
      validation_summary: trace.validation || null,
      trace_payload: trace,
      status: trace.stages.some((stage) => stage.status === 'failed') ? 'failed' : 'completed',
    } as never)
    .select('id')
    .single();

  if (error) {
    console.warn('[GenerationTraceStore] Failed to save generation trace:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  if (plannerStage) {
    return data.id;
  }

  return data.id;
}
