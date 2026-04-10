import { NextRequest, NextResponse } from 'next/server';
import {
  createCompleteMessage,
  createErrorMessage,
  createHeartbeatMessage,
  createSSEStream,
  createTextChunkMessage,
} from '@/lib/ai/claude-client';
import { createTestContext, parseAndRemoveLogicCheck } from '@/core/engine/prompt-injector';
import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';
import { normalizeSerialParagraphs, trimReplayRestart } from '@/lib/editor/serial-normalizer';
import {
  validateEpisode,
  validateFirstEpisode,
} from '@/core/engine/commercial-validator';
import { getWritingDNA } from '@/core/style/writing-dna';
import {
  buildGenerationComparisonSummary,
  generateEpisodeWithOrchestrator,
} from '@/core/engine/writing-orchestrator';
import type { EpisodeGenerationRequest, SlidingWindowContext } from '@/types/memory';
import type {
  CompareCandidateResult,
  GenerationComparisonResult,
  StageProgressEvent,
} from '@/types/generation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MOCK_EPISODE_TEXT = `찬 기운이 나무 울타리를 훑고 지나갈 때, 그는 새벽보다 먼저 눈을 떴다.
잠기지 않은 대문 틈으로 피 냄새가 스며들었고, 마당의 흙바닥에는 밤새 누군가가 끌려간 자국이 길게 남아 있었다.
우물가에 선 노인은 질문 대신 대문 쪽을 바라본 채 말끝을 눌렀다.
"봤지."
그 한마디가 끝나기 무섭게, 바람이 멎은 골목에서 발자국 소리가 하나 더 늘어났다.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as EpisodeGenerationRequest & {
      useTestContext?: boolean;
      useMock?: boolean;
      context?: unknown;
      responseMode?: 'stream' | 'json';
      blindMode?: boolean;
    };

    const {
      userInstruction = 'Write a tense commercial opening.',
      targetEpisodeNumber = 2,
      compareModes = false,
      responseMode = 'stream',
      blindMode = true,
      useTestContext = false,
      useMock = false,
      projectId,
    } = body;

    if (useMock) {
      if (compareModes && responseMode === 'json') {
        return NextResponse.json({
          comparison: createMockComparison(blindMode),
        });
      }
      return createMockStreamResponse(compareModes);
    }

    let context: SlidingWindowContext;
    if (projectId) {
      context = await buildSlidingWindowContext(projectId, targetEpisodeNumber, {
        windowSize: 3,
        includeWritingPreferences: true,
        includeSynopses: true,
        includeTimelineEvents: true,
      });
    } else if (useTestContext) {
      context = createTestContext();
    } else if (body.context) {
      context = body.context as SlidingWindowContext;
    } else {
      return new Response(
        JSON.stringify({
          error: 'projectId or context is required.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const comparison = compareModes
      ? await buildGenerationComparisonSummary({
        projectId: projectId || 'test-project',
        context,
        userInstruction,
        targetEpisodeNumber,
        requestedMode: 'claude_legacy',
      })
      : undefined;

    if (compareModes && responseMode === 'json') {
      const result = await buildComparisonResult({
        projectId: projectId || 'test-project',
        context,
        userInstruction,
        targetEpisodeNumber,
        blindMode,
      });
      return NextResponse.json({ comparison: result });
    }

    const stream = createSSEStream(async ({ enqueue, close }) => {
      try {
        const orchestration = await generateEpisodeWithOrchestrator({
          projectId: projectId || 'test-project',
          targetEpisodeNumber,
          userInstruction,
          context,
          requestedMode: 'claude_legacy',
          compareModes,
          onHeartbeat: (message) => {
            enqueue(createHeartbeatMessage(message));
          },
          onTextChunk: (chunk) => {
            enqueue(createTextChunkMessage(chunk));
          },
          onStageUpdate: (event) => {
            enqueue(JSON.stringify({ type: 'stage', stageEvent: event }));
          },
        });

        enqueue(
          createCompleteMessage({
            fullText: orchestration.fullText,
            charCount: orchestration.fullText.length,
            inputTokens: orchestration.inputTokens,
            outputTokens: orchestration.outputTokens,
          })
        );

        enqueue(
          JSON.stringify({
            type: 'metadata',
            targetEpisodeNumber,
            promptMetadata: orchestration.promptMetadata,
            comparison: orchestration.comparison || comparison,
            generationInfo: {
              requestedMode: orchestration.route.requestedMode,
              resolvedMode: orchestration.route.resolvedMode,
              plannerModel: orchestration.route.plannerModel,
              proseModel: orchestration.route.proseModel,
              punchupModel: orchestration.route.punchupModel,
              fallbackReason: orchestration.route.fallbackReason,
            },
            pipeline: sanitizePipeline(orchestration.trace.stages),
            metrics: orchestration.metrics,
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        enqueue(createErrorMessage(message));
      }

      close();
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function sanitizePipeline(stages: Array<{
  stage: string;
  provider: string;
  model: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  metadata?: Record<string, unknown>;
  error?: string;
}>): StageProgressEvent[] {
  return stages.map((stage) => ({
    stage: stage.stage as StageProgressEvent['stage'],
    status: stage.status as StageProgressEvent['status'],
    provider: stage.provider as StageProgressEvent['provider'],
    model: stage.model,
    startedAt: stage.startedAt,
    completedAt: stage.completedAt,
    latencyMs: stage.completedAt
      ? new Date(stage.completedAt).getTime() - new Date(stage.startedAt).getTime()
      : undefined,
    metadata: stage.metadata,
    error: stage.error,
  }));
}

async function buildComparisonResult(params: {
  projectId: string;
  context: SlidingWindowContext;
  userInstruction: string;
  targetEpisodeNumber: number;
  blindMode: boolean;
}): Promise<GenerationComparisonResult> {
  const startedAt = Date.now();
  const orchestration = await generateEpisodeWithOrchestrator({
    projectId: params.projectId,
    context: params.context,
    userInstruction: params.userInstruction,
    targetEpisodeNumber: params.targetEpisodeNumber,
    requestedMode: 'claude_legacy',
  });

  const { cleanContent } = parseAndRemoveLogicCheck(orchestration.fullText);
  const content = normalizeSerialParagraphs(trimReplayRestart(cleanContent));
  const writingDna = params.projectId ? await getWritingDNA(params.projectId) : null;
  const validation =
    params.targetEpisodeNumber === 1
      ? validateFirstEpisode(content, { writingDna })
      : validateEpisode(content, { writingDna });

  const candidate: CompareCandidateResult = {
    id: 'claude-legacy-a',
    label: 'Version A',
    blindedLabel: 'A',
    mode: 'claude_legacy',
    content,
    charCount: content.length,
    validatorScore: validation.overallScore,
    openingScore: scoreOpening(content),
    endingScore: scoreEnding(content),
    latencyMs: Date.now() - startedAt,
    estimatedCostUsd: orchestration.metrics?.estimatedCostUsd,
    modelSummary: orchestration.route.proseModel,
    fallbackReason: orchestration.route.fallbackReason,
    excerpts: buildExcerpts(content),
  };

  return {
    requestedMode: 'claude_legacy',
    blindMode: params.blindMode,
    candidates: [candidate],
  };
}

function createMockComparison(blindMode: boolean): GenerationComparisonResult {
  return {
    requestedMode: 'claude_legacy',
    blindMode,
    candidates: [
      {
        id: 'mock-claude-a',
        label: 'Version A',
        blindedLabel: 'A',
        mode: 'claude_legacy',
        content: MOCK_EPISODE_TEXT,
        charCount: MOCK_EPISODE_TEXT.length,
        validatorScore: 82,
        openingScore: 80,
        endingScore: 84,
        latencyMs: 9200,
        estimatedCostUsd: 0.03,
        modelSummary: 'claude-sonnet-4-20250514',
        excerpts: buildExcerpts(MOCK_EPISODE_TEXT),
      },
    ],
  };
}

function buildExcerpts(content: string) {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return {
    opening: content.slice(0, 480).trim(),
    ending: content.slice(-480).trim(),
    dialogue: paragraphs.filter((paragraph) => /["“”'‘’「」『』]/.test(paragraph)).slice(0, 2),
  };
}

function scoreOpening(content: string) {
  const opening = content.slice(0, 500);
  let score = 60;

  if (opening.length >= 300) score += 10;
  if (/[!?]/.test(opening)) score += 10;
  if (/[가-힣]/.test(opening)) score += 10;
  if (/["“”'‘’「」『』]/.test(opening)) score += 5;

  return Math.min(score, 100);
}

function scoreEnding(content: string) {
  const ending = content.slice(-500);
  let score = 60;

  if (ending.length >= 250) score += 10;
  if (/[!?]/.test(ending)) score += 10;
  if (/(위기|발견|반전|선언|정체|그 순간|그때)/.test(ending)) score += 10;
  if (!ending.endsWith('.')) score += 5;

  return Math.min(score, 100);
}

function createMockStreamResponse(compareModes: boolean): Response {
  const encoder = new TextEncoder();
  const startedAt = new Date().toISOString();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${createHeartbeatMessage('[Mock] Claude single-writer stream is ready.')}\n\n`)
      );

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'stage',
          stageEvent: {
            stage: 'prose',
            status: 'running',
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            startedAt,
            summary: 'Mock prose is being written.',
          },
        })}\n\n`)
      );

      await sleep(200);

      controller.enqueue(
        encoder.encode(`data: ${createTextChunkMessage(MOCK_EPISODE_TEXT)}\n\n`)
      );

      await sleep(150);

      controller.enqueue(
        encoder.encode(`data: ${createCompleteMessage({
          fullText: MOCK_EPISODE_TEXT,
          charCount: MOCK_EPISODE_TEXT.length,
          inputTokens: 120,
          outputTokens: 240,
        })}\n\n`)
      );

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({
          type: 'metadata',
          promptMetadata: {
            appliedWritingMemoryIds: [],
            appliedWritingMemoryCount: 0,
            appliedWritingDna: false,
            appliedSerialStyle: true,
            appliedFirstEpisodeDirective: false,
          },
          generationInfo: {
            requestedMode: 'claude_legacy',
            resolvedMode: 'claude_legacy',
            plannerModel: null,
            proseModel: 'claude-sonnet-4-20250514',
            punchupModel: null,
          },
          pipeline: [
            {
              stage: 'prose',
              status: 'completed',
              provider: 'anthropic',
              model: 'claude-sonnet-4-20250514',
              startedAt,
              completedAt: new Date().toISOString(),
              summary: 'Mock prose completed.',
              latencyMs: 500,
            },
          ],
          metrics: {
            totalLatencyMs: 820,
            estimatedCostUsd: 0.03,
            actualCostUsd: 0.03,
          },
          comparison: compareModes ? createMockComparison(true) : undefined,
        })}\n\n`)
      );

      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
