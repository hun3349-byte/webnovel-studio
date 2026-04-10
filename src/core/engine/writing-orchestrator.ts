import { buildClaudeProsePrompts } from '@/core/engine/prompts/claude-prose';
import { resolveModelRoute } from '@/core/engine/model-router';
import { generateEpisodeStreaming } from '@/lib/ai/claude-client';
import type {
  DryRunPromptSummary,
  EpisodeGenerationTrace,
  GenerationCostSummary,
  GenerationComparisonSummary,
  GenerationRunMetrics,
  GenerationTraceStage,
  StageProgressEvent,
  WritingOrchestratorInput,
  WritingOrchestratorResult,
} from '@/types/generation';

export async function generateEpisodeWithOrchestrator(
  input: WritingOrchestratorInput
): Promise<WritingOrchestratorResult> {
  const startedAt = Date.now();
  const route = resolveModelRoute({ requestedMode: input.requestedMode });
  const comparison = input.compareModes
    ? await buildGenerationComparisonSummary(input)
    : undefined;

  const trace: EpisodeGenerationTrace = {
    route,
    promptMetadata: {
      appliedWritingMemoryIds: [],
      appliedWritingMemoryCount: 0,
      appliedWritingDna: false,
      appliedSerialStyle: false,
      appliedFirstEpisodeDirective: false,
    },
    stages: [],
    plannerOutput: null,
  };

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalText = '';

  const prosePrompts = await buildClaudeProsePrompts({
    context: input.context,
    userInstruction: input.userInstruction,
    targetEpisodeNumber: input.targetEpisodeNumber,
    projectId: input.projectId,
    commercialPlan: null,
  });

  trace.promptMetadata = prosePrompts.metadata;
  const proseStage = createStage('prose', 'anthropic', route.proseModel, {
    systemLength: prosePrompts.systemPrompt.length,
    userLength: prosePrompts.userPrompt.length,
  });
  trace.stages.push(proseStage);

  input.onStageUpdate?.(toStageProgressEvent(proseStage, 'Preparing Claude writing stage.'));
  proseStage.status = 'running';
  input.onStageUpdate?.(
    toStageProgressEvent(
      proseStage,
      'Claude is drafting long-form prose from world/character/synopsis continuity.'
    )
  );
  input.onHeartbeat?.('Claude is drafting the episode...');

  const proseResult = await generateEpisodeStreaming({
    model: route.proseModel,
    systemPrompt: prosePrompts.systemPrompt,
    userPrompt: prosePrompts.userPrompt,
    maxTokens: 8192,
    temperature: 0.8,
    onTextChunk: (chunk) => {
      finalText += chunk;
      input.onTextChunk?.(chunk);
    },
  });

  totalInputTokens += proseResult.inputTokens;
  totalOutputTokens += proseResult.outputTokens;
  finalText = proseResult.fullText;

  completeStage(proseStage, proseResult.fullText, {
    charCount: proseResult.fullText.length,
    continuityAnchored: Boolean(input.context.previousEpisodeEnding || input.context.lastSceneAnchor),
    synopsisAnchored: Boolean(
      input.context.episodeSynopses?.some(
        (synopsis) =>
          synopsis.isCurrent || synopsis.episodeNumber === input.targetEpisodeNumber
      )
    ),
  });
  input.onStageUpdate?.(
    toStageProgressEvent(
      proseStage,
      `Draft completed at ${proseResult.fullText.length.toLocaleString()} chars.`,
      proseResult.inputTokens,
      proseResult.outputTokens
    )
  );

  const metrics: GenerationRunMetrics = {
    totalLatencyMs: Date.now() - startedAt,
  };
  const costSummary = estimateRunCost(route.proseProvider, route.proseModel, totalInputTokens, totalOutputTokens);
  metrics.estimatedCostUsd = costSummary.estimatedCostUsd;
  metrics.actualCostUsd = costSummary.estimatedCostUsd;

  return {
    mode: route.resolvedMode,
    route,
    fullText: finalText,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    metrics,
    promptMetadata: trace.promptMetadata,
    prosePrompts: {
      systemPrompt: prosePrompts.systemPrompt,
      userPrompt: prosePrompts.userPrompt,
    },
    trace: {
      ...trace,
      validation: trace.validation,
    },
    comparison,
  };
}

export async function buildGenerationComparisonSummary(
  input: Pick<
    WritingOrchestratorInput,
    'projectId' | 'context' | 'userInstruction' | 'targetEpisodeNumber' | 'requestedMode'
  >
): Promise<GenerationComparisonSummary> {
  const route = resolveModelRoute({ requestedMode: input.requestedMode });
  const prosePrompts = await buildClaudeProsePrompts({
    context: input.context,
    userInstruction: input.userInstruction,
    targetEpisodeNumber: input.targetEpisodeNumber,
    projectId: input.projectId,
    commercialPlan: null,
  });

  const candidate: DryRunPromptSummary = {
    mode: route.resolvedMode,
    plannerEnabled: false,
    punchupEnabled: false,
    proseProvider: route.proseProvider,
    plannerProvider: null,
    punchupProvider: null,
    prosePromptLength: prosePrompts.systemPrompt.length + prosePrompts.userPrompt.length,
    estimatedCostUsd: estimateLegacyModeCost(),
    estimatedLatencyMs: estimateLegacyModeLatency(),
    modelSummary: route.proseModel,
    fallbackReason: route.fallbackReason,
  };

  return {
    requestedMode: input.requestedMode || 'claude_legacy',
    candidates: [candidate],
  };
}

function createStage(
  stage: GenerationTraceStage['stage'],
  provider: GenerationTraceStage['provider'],
  model: string,
  metadata?: Record<string, unknown>
): GenerationTraceStage {
  return {
    stage,
    provider,
    model,
    startedAt: new Date().toISOString(),
    status: 'pending',
    metadata,
  };
}

function completeStage(
  stage: GenerationTraceStage,
  hiddenOutput: string,
  metadata?: Record<string, unknown>
) {
  stage.status = 'completed';
  stage.completedAt = new Date().toISOString();
  stage.hiddenOutput = hiddenOutput;
  stage.metadata = {
    ...(stage.metadata || {}),
    ...(metadata || {}),
  };
}

function toStageProgressEvent(
  stage: GenerationTraceStage,
  summary?: string,
  inputTokens?: number,
  outputTokens?: number
): StageProgressEvent {
  const latencyMs = stage.completedAt
    ? new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()
    : undefined;

  return {
    stage: stage.stage,
    status: stage.status,
    provider: stage.provider,
    model: stage.model,
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
    summary,
    latencyMs,
    metadata: {
      ...(stage.metadata || {}),
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(inputTokens !== undefined || outputTokens !== undefined
        ? { estimatedCostUsd: estimateStageCost(stage.provider, stage.model, inputTokens || 0, outputTokens || 0) }
        : {}),
    },
  };
}

function estimateLegacyModeCost(): number {
  return 0.045;
}

function estimateLegacyModeLatency(): number {
  return 18000;
}

function estimateRunCost(
  provider: StageProgressEvent['provider'],
  model: string,
  inputTokens: number,
  outputTokens: number
): GenerationCostSummary {
  return {
    estimatedCostUsd: estimateStageCost(provider, model, inputTokens, outputTokens),
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
  };
}

function estimateStageCost(
  provider: StageProgressEvent['provider'],
  _model: string,
  inputTokens: number,
  outputTokens: number
): number {
  if (provider === 'anthropic') {
    return Number(((inputTokens * 0.0000004) + (outputTokens * 0.0000018)).toFixed(4));
  }

  if (provider === 'openai') {
    return Number(((inputTokens * 0.0000006) + (outputTokens * 0.0000024)).toFixed(4));
  }

  return 0;
}
