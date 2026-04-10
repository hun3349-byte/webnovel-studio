import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';
import { parseAndRemoveLogicCheck } from '@/core/engine/prompt-injector';
import { incrementAppliedCount } from '@/core/memory/writing-memory-learner';
import {
  createCompleteMessage,
  createErrorMessage,
  createHeartbeatMessage,
  createSSEStream,
  createTextChunkMessage,
  generateCompletion,
} from '@/lib/ai/claude-client';
import { generateEpisodeWithOrchestrator } from '@/core/engine/writing-orchestrator';
import { saveGenerationTrace } from '@/core/engine/generation-trace-store';
import { normalizeSerialParagraphs, trimReplayRestart } from '@/lib/editor/serial-normalizer';
import { generateOpenAIText } from '@/lib/ai/openai-client';
import type { EpisodeGenerationRequest, SlidingWindowContext } from '@/types/memory';
import type { StageProgressEvent } from '@/types/generation';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const RECOMMENDED_CHAR_COUNT = 4000;
const MIN_ACCEPTABLE_CHAR_COUNT = 2200;
const MIN_CHAR_COUNT = RECOMMENDED_CHAR_COUNT;
const MAX_CHAR_COUNT = 6000;
const CONTINUATION_MAX_ATTEMPTS = 1;
const AUTO_RETRY_MAX_ATTEMPTS = 5;
const ENDING_COMPLETION_MAX_ATTEMPTS = 2;
const CONTINUATION_APPEND_MAX_CHARS = 2200;
const CONTINUATION_APPEND_MIN_CHARS = 120;

type ValidatorCheckId =
  | 'sentence_split'
  | 'consistency'
  | 'continuity'
  | 'show_not_tell'
  | 'vocabulary';

interface ValidatorCheck {
  id: ValidatorCheckId;
  label: string;
  passed: boolean;
  score: number;
  comment: string;
}

interface ValidatorResult {
  overallScore: number;
  passed: boolean;
  summary: string;
  checks: ValidatorCheck[];
  suggestions: string[];
  inputTokens: number;
  outputTokens: number;
  model: string;
}

const VALIDATOR_SYSTEM_PROMPT = `
너는 깐깐하고 자비 없는 수석 편집장(Validator)이다.
너의 임무는 Claude 원고를 수정하지 않고 평가하는 것이다.
반드시 PASS/FAIL을 명확히 판정하고 위반 근거를 짧고 정확히 지적하라.

검수 5대 규칙:
1) sentence_split: 단문을 유치하게 뚝뚝 끊어 쓰지 않았는가?
2) consistency: 시놉시스/세계관/캐릭터 DB 팩트를 왜곡하거나 임의 인물/배경을 창조하지 않았는가?
3) continuity: 이전 회차 Memory Log와 모순 없이 이어지는가?
4) show_not_tell: 설명충 서술보다 행동/감각 묘사 중심인가?
5) vocabulary: 해당 세계관의 시대 어휘를 지키고 현대 부조화 어휘를 남발하지 않았는가?

치명적 FAIL 규칙:
- consistency 항목이 FAIL이면 전체 결과는 반드시 FAIL.
- 시놉시스/세계관에 없는 핵심 인물, 핵심 배경, 핵심 사건 창조 시 consistency.score <= 20.

반드시 JSON만 반환:
{
  "overallScore": number,
  "passed": boolean,
  "summary": "짧은 한국어 판정 요약",
  "checks": [
    {
      "id": "sentence_split|consistency|continuity|show_not_tell|vocabulary",
      "label": "한국어 라벨",
      "passed": boolean,
      "score": number,
      "comment": "근거가 짧고 구체적인 한국어 코멘트"
    }
  ],
  "suggestions": ["재작성용 짧은 지시 1", "재작성용 짧은 지시 2"]
}
`.trim();

const VALIDATOR_SYSTEM_PROMPT_V2 = `
너는 원고를 직접 수정하지 않는 수석 검수관이다.
Claude 초고를 PASS/FAIL로 엄격하게 판정하라.

검수 항목:
1) sentence_split: 문장을 과도하게 잘게 끊어 가독성을 해치지 않았는가?
2) consistency: 시놉시스/세계관/캐릭터 DB 팩트를 왜곡하거나 임의 사건/인물/배경을 창조하지 않았는가?
3) continuity: 이전 회차 memory log와 모순 없이 자연스럽게 이어지는가?
4) show_not_tell: 해설 위주가 아니라 행동/감각 중심으로 전개되는가?
5) vocabulary: 세계관과 시대에 맞는 어휘를 유지하는가?
6) repetition: 같은 사건/설명 블록을 진전 없이 반복하지 않았는가?

치명적 FAIL 규칙:
- consistency FAIL이면 전체 결과는 반드시 FAIL.
- repetition FAIL이면 전체 결과는 반드시 FAIL.
- 시놉시스/세계관에 없는 핵심 사건/인물/배경 창조 시 consistency.score <= 20.
- 반복 서술이 명백하면 repetition.score <= 30.

아래 JSON만 반환하라:
{
  "overallScore": number,
  "passed": boolean,
  "summary": "한 줄 요약",
  "checks": [
    {
      "id": "sentence_split|consistency|continuity|show_not_tell|vocabulary|repetition",
      "label": "항목명",
      "passed": boolean,
      "score": number,
      "comment": "근거"
    }
  ],
  "suggestions": ["개선 지침 1", "개선 지침 2"]
}
`.trim();

const CAUSALITY_VALIDATION_APPENDIX = `
[Causality Enforcement]
- Atomization: 주요 사건이 A(상황) -> B(발견/인지) -> C(행동/결과) 단계를 생략 없이 밟았는지 확인하라.
- Trigger Chain: 문단 간 인과 트리거가 있는지 확인하라. 요약 점프(A->C)면 감점/FAIL 근거를 제시하라.
- Character Reaction: 사건과 결과 사이에 캐릭터 고유 리액션(성격/말투 기반)이 존재하는지 확인하라.
- 위 항목은 기존 체크에 매핑해 평가한다:
  - sentence_split / continuity / show_not_tell 코멘트에 구체 근거로 반영한다.
`.trim();

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication required.', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({
          error: 'OPENAI_API_KEY is required for validator-gated generation.',
          code: 'OPENAI_API_KEY_MISSING',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body: EpisodeGenerationRequest = await request.json();
    const {
      projectId,
      targetEpisodeNumber,
      userInstruction,
      windowSize = 3,
      longTermSearchQueries = [],
      saveToDb = false,
      continueFromExisting = false,
      existingContent = '',
      forceContinue = false,
    } = body;

    const existingDraft = typeof existingContent === 'string' ? existingContent : '';
    const shouldContinueFromExisting =
      Boolean(continueFromExisting) &&
      (Boolean(forceContinue)
        ? existingDraft.trim().length > 0
        : existingDraft.trim().length >= 120);
    const baseInstruction = shouldContinueFromExisting
      ? buildContinueFromExistingInstruction(userInstruction, existingDraft)
      : userInstruction;

    const stream = createSSEStream(async ({ enqueue, close }) => {
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      try {
        enqueue(createHeartbeatMessage('시뮬레이션 데이터 로딩 중...'));

        const context = await buildSlidingWindowContext(projectId, targetEpisodeNumber, {
          windowSize,
          longTermSearchQueries,
          includeWritingPreferences: true,
          includeSynopses: true,
          includeTimelineEvents: true,
        });

        enqueue(createHeartbeatMessage('집필 파이프라인 시작: Claude -> OpenAI Validator'));

        const generation = await runAutoRetryPipeline({
          projectId,
          targetEpisodeNumber,
          baseInstruction,
          context,
          continueFromExisting: shouldContinueFromExisting,
          existingContent: shouldContinueFromExisting ? existingDraft : '',
          enqueueHeartbeat: (message) => enqueue(createHeartbeatMessage(message)),
          enqueueTextChunk: (chunk) => enqueue(createTextChunkMessage(chunk)),
          enqueueStage: (event) =>
            enqueue(JSON.stringify({ type: 'stage', stageEvent: event })),
        });

        totalInputTokens += generation.totalInputTokens;
        totalOutputTokens += generation.totalOutputTokens;

        let episodeId: string | null = null;
        if (saveToDb) {
          const insertClient = await createServerSupabaseClient();
          const { data: episode, error } = await insertClient
            .from('episodes')
            .insert({
              project_id: projectId,
              episode_number: targetEpisodeNumber,
              content: generation.finalContent,
              original_content: generation.finalContent,
              char_count: generation.finalContent.length,
              status: 'draft',
              log_status: 'pending',
            })
            .select()
            .single();

          if (error) {
            enqueue(createErrorMessage(`Failed to save episode: ${error.message}`));
          } else {
            episodeId = episode.id;
          }
        }

        const trace = {
          ...generation.finalOrchestration.trace,
          validation: {
            overallScore: generation.validatorResult.overallScore,
            passed: generation.validatorResult.passed,
            suggestions: generation.validatorResult.suggestions,
          },
        };

        const traceId = await saveGenerationTrace({
          projectId,
          episodeId,
          targetEpisodeNumber,
          userInstruction: baseInstruction,
          finalContent: generation.finalContent,
          trace,
        });

        enqueue(
          createCompleteMessage({
            fullText: generation.finalContent,
            charCount: generation.finalContent.length,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          })
        );

        enqueue(
          JSON.stringify({
            type: 'metadata',
            episodeId,
            traceId,
            targetEpisodeNumber,
            promptMetadata: generation.finalOrchestration.promptMetadata,
            validation: {
              overallScore: generation.validatorResult.overallScore,
              passed: generation.validatorResult.passed,
              summary: generation.validatorResult.summary,
              checks: generation.validatorResult.checks,
              suggestions: generation.validatorResult.suggestions,
            },
            generationInfo: {
              requestedMode: generation.finalOrchestration.route.requestedMode,
              resolvedMode: generation.finalOrchestration.route.resolvedMode,
              plannerModel: generation.finalOrchestration.route.plannerModel,
              proseModel: generation.finalOrchestration.route.proseModel,
              punchupModel: generation.finalOrchestration.route.punchupModel,
              fallbackReason: generation.finalOrchestration.route.fallbackReason,
              autoRetryAttempts: generation.attemptsUsed,
              autoRetryMax: AUTO_RETRY_MAX_ATTEMPTS,
            },
            pipeline: [...sanitizePipeline(generation.finalOrchestration.trace.stages), generation.qualityStage],
            metrics: {
              ...generation.finalOrchestration.metrics,
              totalInputTokens,
              totalOutputTokens,
              autoRetryAttempts: generation.attemptsUsed,
            },
          })
        );

        if (generation.finalOrchestration.promptMetadata.appliedWritingMemoryIds.length > 0) {
          try {
            await incrementAppliedCount(
              projectId,
              generation.finalOrchestration.promptMetadata.appliedWritingMemoryIds
            );
          } catch (error) {
            console.warn('[GenerateEpisode] Failed to increment writing memory counts:', error);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[GenerateEpisode] error:', error);
        enqueue(createErrorMessage(errorMessage));
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
    console.error('[GenerateEpisode] error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function runAutoRetryPipeline(params: {
  projectId: string;
  targetEpisodeNumber: number;
  baseInstruction: string;
  context: SlidingWindowContext;
  continueFromExisting?: boolean;
  existingContent?: string;
  enqueueHeartbeat: (message: string) => void;
  enqueueTextChunk: (chunk: string) => void;
  enqueueStage: (event: StageProgressEvent) => void;
}) {
  let runningInstruction = params.baseInstruction;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalContent = '';
  let finalValidatorResult: ValidatorResult | null = null;
  let finalOrchestration: Awaited<ReturnType<typeof generateEpisodeWithOrchestrator>> | null = null;
  let finalQualityStage: StageProgressEvent | null = null;
  let attemptsUsed = 0;
  const seedExistingContent =
    params.continueFromExisting && params.existingContent
      ? normalizeSerialParagraphs(params.existingContent).trim()
      : '';

  for (let attempt = 1; attempt <= AUTO_RETRY_MAX_ATTEMPTS; attempt += 1) {
    attemptsUsed = attempt;
    params.enqueueHeartbeat(`Claude 집필 시도 ${attempt}/${AUTO_RETRY_MAX_ATTEMPTS}...`);

    const orchestration = await generateEpisodeWithOrchestrator({
      projectId: params.projectId,
      targetEpisodeNumber: params.targetEpisodeNumber,
      userInstruction: runningInstruction,
      context: params.context,
      requestedMode: 'claude_legacy',
      onHeartbeat: params.enqueueHeartbeat,
      onTextChunk: params.enqueueTextChunk,
      onStageUpdate: params.enqueueStage,
    });

    totalInputTokens += orchestration.inputTokens;
    totalOutputTokens += orchestration.outputTokens;

    const { cleanContent } = parseAndRemoveLogicCheck(orchestration.fullText);
    let candidateContent = normalizeSerialParagraphs(trimReplayRestart(cleanContent));

    if (seedExistingContent) {
      candidateContent = mergeWithExistingContent(seedExistingContent, candidateContent);
      params.enqueueHeartbeat('기존 본문 유지 모드: 이어쓰기 결과를 병합했습니다.');
    }

    if (!seedExistingContent && candidateContent.length < RECOMMENDED_CHAR_COUNT) {
      const expansion = await expandEpisodeToMinimumLength({
        systemPrompt: orchestration.prosePrompts.systemPrompt,
        content: candidateContent,
        targetEpisodeNumber: params.targetEpisodeNumber,
        targetCharCount: RECOMMENDED_CHAR_COUNT,
        enqueueStatus: params.enqueueHeartbeat,
      });
      candidateContent = normalizeSerialParagraphs(trimReplayRestart(expansion.content));
      totalInputTokens += expansion.inputTokens;
      totalOutputTokens += expansion.outputTokens;
    }

    if (!seedExistingContent && false && candidateContent.length < MIN_CHAR_COUNT) {
      const shortfall = MIN_CHAR_COUNT - candidateContent.length;

      if (attempt === AUTO_RETRY_MAX_ATTEMPTS) {
        params.enqueueStage(
          createRetryingStageEvent({
            status: 'failed',
            attempt,
            maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
            summary: `분량 부족으로 생성 실패 (${candidateContent.length.toLocaleString()}자)`,
            reason: `Need at least ${MIN_CHAR_COUNT} chars (shortfall: ${shortfall}).`,
          })
        );
        throw new Error(
          `분량이 ${candidateContent.length.toLocaleString()}자로 부족합니다. (최소 ${MIN_CHAR_COUNT.toLocaleString()}자 필요)`
        );
      }

      params.enqueueHeartbeat(
        `분량 부족 감지 (${candidateContent.length.toLocaleString()}자). 분량 확장 재시도 (${attempt + 1}/${AUTO_RETRY_MAX_ATTEMPTS})...`
      );
      params.enqueueStage(
        createRetryingStageEvent({
          status: 'running',
          attempt: attempt + 1,
          maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
          summary: `분량 부족(${candidateContent.length.toLocaleString()}자)으로 재작성 중...`,
          reason: `Need at least ${MIN_CHAR_COUNT} chars (shortfall: ${shortfall}).`,
        })
      );
      runningInstruction = buildLengthRecoveryInstruction({
        originalInstruction: params.baseInstruction,
        currentLength: candidateContent.length,
        minCharCount: MIN_CHAR_COUNT,
      });
      continue;
    }

    const replayTrimmed = trimReplayRestart(candidateContent);
    if (replayTrimmed.length + 180 < candidateContent.length) {
      candidateContent = normalizeSerialParagraphs(replayTrimmed);
      params.enqueueHeartbeat('반복 구간 감지: 중복 블록을 제거하고 완결 우선으로 진행합니다.');
    }
    candidateContent = pruneRepeatedTailPassages(candidateContent);

    if (!seedExistingContent && candidateContent.length < MIN_ACCEPTABLE_CHAR_COUNT) {
      params.enqueueHeartbeat(
        `분량이 권장치보다 짧습니다 (${candidateContent.length.toLocaleString()}자). 반복 재작성 대신 엔딩 완결을 우선합니다.`
      );
    }

    const endingCompletion = await ensureCompleteEnding({
      systemPrompt: orchestration.prosePrompts.systemPrompt,
      content: candidateContent,
      targetEpisodeNumber: params.targetEpisodeNumber,
      enqueueStatus: params.enqueueHeartbeat,
    });
    candidateContent = normalizeSerialParagraphs(trimReplayRestart(endingCompletion.content));
    candidateContent = pruneRepeatedTailPassages(candidateContent);
    totalInputTokens += endingCompletion.inputTokens;
    totalOutputTokens += endingCompletion.outputTokens;

    const openingGate = evaluateOpeningContinuity(candidateContent, params.context);
    if (!openingGate.passed) {
      params.enqueueHeartbeat(
        `오프닝 연속성 게이트 FAIL: ${openingGate.reason}. 오프닝 구간만 보정합니다.`
      );
      const openingRepair = await repairOpeningContinuity({
        systemPrompt: orchestration.prosePrompts.systemPrompt,
        content: candidateContent,
        context: params.context,
        targetEpisodeNumber: params.targetEpisodeNumber,
      });
      candidateContent = normalizeSerialParagraphs(trimReplayRestart(openingRepair.content));
      candidateContent = pruneRepeatedTailPassages(candidateContent);
      totalInputTokens += openingRepair.inputTokens;
      totalOutputTokens += openingRepair.outputTokens;
    }

    if (isLikelyTruncatedEnding(candidateContent)) {
      const trimmed = trimIncompleteTail(candidateContent);
      if (trimmed.length >= Math.floor(candidateContent.length * 0.8)) {
        candidateContent = trimmed;
      }
    }

    const validatorRunningEvent = createQualityStageEvent({
      status: 'running',
      overallScore: undefined,
      passed: undefined,
      suggestionCount: undefined,
      summary: `OpenAI 검수 시도 ${attempt}/${AUTO_RETRY_MAX_ATTEMPTS} 진행 중...`,
    });
    params.enqueueStage(validatorRunningEvent);

    const validatorResult = await runOpenAIValidator({
      model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4o',
      content: candidateContent,
      episodeNumber: params.targetEpisodeNumber,
      context: params.context,
    });
    totalInputTokens += validatorResult.inputTokens;
    totalOutputTokens += validatorResult.outputTokens;

    const validatorCompletedEvent = createQualityStageEvent({
      status: validatorResult.passed ? 'completed' : 'failed',
      overallScore: validatorResult.overallScore,
      passed: validatorResult.passed,
      suggestionCount: validatorResult.suggestions.length,
      summary: validatorResult.passed
        ? `OpenAI 검수 PASS (${validatorResult.overallScore})`
        : `OpenAI 검수 FAIL (${validatorResult.overallScore})`,
    });
    params.enqueueStage(validatorCompletedEvent);

    let finalCandidateContent = candidateContent;
    let finalCandidateValidator = validatorResult;
    let finalCandidateQualityEvent = validatorCompletedEvent;

    if (!validatorResult.passed && attempt < AUTO_RETRY_MAX_ATTEMPTS) {
      params.enqueueHeartbeat(
        'OpenAI 검수 FAIL 감지. 전체 재생성 전에 문제 구간 보정을 먼저 시도합니다.'
      );
      const segmentRepair = await repairSegmentsFromValidator({
        systemPrompt: orchestration.prosePrompts.systemPrompt,
        content: candidateContent,
        validatorResult,
        context: params.context,
        targetEpisodeNumber: params.targetEpisodeNumber,
      });

      if (segmentRepair.applied) {
        finalCandidateContent = normalizeSerialParagraphs(
          trimReplayRestart(segmentRepair.content)
        );
        finalCandidateContent = pruneRepeatedTailPassages(finalCandidateContent);
        totalInputTokens += segmentRepair.inputTokens;
        totalOutputTokens += segmentRepair.outputTokens;

        const patchedValidatorRunningEvent = createQualityStageEvent({
          status: 'running',
          overallScore: undefined,
          passed: undefined,
          suggestionCount: undefined,
          summary: `OpenAI 재검수(구간 보정 후) ${attempt}/${AUTO_RETRY_MAX_ATTEMPTS} 진행 중...`,
        });
        params.enqueueStage(patchedValidatorRunningEvent);

        const patchedValidator = await runOpenAIValidator({
          model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4o',
          content: finalCandidateContent,
          episodeNumber: params.targetEpisodeNumber,
          context: params.context,
        });
        totalInputTokens += patchedValidator.inputTokens;
        totalOutputTokens += patchedValidator.outputTokens;

        finalCandidateValidator = patchedValidator;
        finalCandidateQualityEvent = createQualityStageEvent({
          status: patchedValidator.passed ? 'completed' : 'failed',
          overallScore: patchedValidator.overallScore,
          passed: patchedValidator.passed,
          suggestionCount: patchedValidator.suggestions.length,
          summary: patchedValidator.passed
            ? `OpenAI 재검수 PASS (${patchedValidator.overallScore})`
            : `OpenAI 재검수 FAIL (${patchedValidator.overallScore})`,
        });
        params.enqueueStage(finalCandidateQualityEvent);
      }
    }

    if (finalCandidateValidator.passed) {
      if (attempt > 1) {
        params.enqueueStage(
          createRetryingStageEvent({
            status: 'completed',
            attempt,
            maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
            summary: `Auto-retry recovered: pass on attempt ${attempt}/${AUTO_RETRY_MAX_ATTEMPTS}.`,
          })
        );
      }

      finalContent = finalCandidateContent;
      finalValidatorResult = finalCandidateValidator;
      finalOrchestration = orchestration;
      finalQualityStage = finalCandidateQualityEvent;
      break;
    }

    if (attempt === AUTO_RETRY_MAX_ATTEMPTS) {
      const failReasons = finalCandidateValidator.checks
        .filter((check) => !check.passed)
        .map((check) => `${check.label}: ${check.comment}`)
        .join(' | ');
      params.enqueueStage(
        createRetryingStageEvent({
          status: 'failed',
          attempt,
          maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
          summary: `Auto-retry failed after ${AUTO_RETRY_MAX_ATTEMPTS} attempts.`,
          reason: failReasons || finalCandidateValidator.summary,
        })
      );
      throw new Error(
        `자동 재작성 ${AUTO_RETRY_MAX_ATTEMPTS}회 후에도 OpenAI 검수 통과 실패. 원인: ${failReasons || finalCandidateValidator.summary}`
      );
    }

    params.enqueueHeartbeat('검수 FAIL 감지. 지적 사항 반영 자동 재작성 실행...');
    params.enqueueStage(
      createRetryingStageEvent({
        status: 'running',
        attempt: attempt + 1,
        maxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
        summary: `검수 반려됨: 재작성 중 (${attempt + 1}/${AUTO_RETRY_MAX_ATTEMPTS})...`,
      })
    );
    runningInstruction = buildAutoRetryInstruction({
      originalInstruction: params.baseInstruction,
      validatorResult: finalCandidateValidator,
      context: params.context,
    });
  }

  if (!finalOrchestration || !finalValidatorResult || !finalQualityStage) {
    throw new Error('Failed to finalize generation pipeline.');
  }

  return {
    finalContent,
    validatorResult: finalValidatorResult,
    finalOrchestration,
    qualityStage: finalQualityStage,
    attemptsUsed,
    totalInputTokens,
    totalOutputTokens,
  };
}

function buildAutoRetryInstruction(params: {
  originalInstruction: string;
  validatorResult: ValidatorResult;
  context: SlidingWindowContext;
}) {
  const context = params.context;
  const failedChecks = params.validatorResult.checks
    .filter((check) => !check.passed)
    .map((check) => `- ${check.label}: ${check.comment}`);

  const suggestions = params.validatorResult.suggestions
    .slice(0, 5)
    .map((item) => `- ${item}`);

  return [
    params.originalInstruction,
    '',
    '[AUTO-RETRY CRITICAL FEEDBACK]',
    'OpenAI 수석 편집장 검수에서 FAIL이 발생했다. 아래 지적을 모두 반영해 처음부터 다시 작성하라.',
    ...failedChecks,
    ...(suggestions.length ? ['', '[REVISION SUGGESTIONS]', ...suggestions] : []),
    '',
    '절대 규칙:',
    '- 시놉시스/세계관/캐릭터 팩트에서 벗어나면 즉시 실패',
    '- 스타카토 문체 금지',
    '- Show, Don\'t Tell 유지',
  ]
    .filter(Boolean)
    .join('\n');
  const transitionContract = context.transitionContract
    ? [
        `[source:${context.transitionContract!.sourceEpisodeNumber} -> target:${context.transitionContract!.targetEpisodeNumber}]`,
        `anchor1: ${context.transitionContract!.anchor1}`,
        `anchor2: ${context.transitionContract!.anchor2}`,
        `anchor3: ${context.transitionContract!.anchor3}`,
        `guardrail: ${context.transitionContract!.openingGuardrail || '-'}`,
      ].join('\n')
    : '?놁쓬';
  const previousSnapshots = (context.previousCharacterSnapshots || [])
    .slice(0, 12)
    .map(
      (item) =>
        `${item.name} | role:${item.role || 'unknown'} | location:${item.location || 'unknown'} | emotion:${item.emotionalState || 'unknown'}`
    )
    .join('\n');
}

function buildLengthRecoveryInstruction(params: {
  originalInstruction: string;
  currentLength: number;
  minCharCount: number;
}) {
  return [
    params.originalInstruction,
    '',
    '[LENGTH RECOVERY DIRECTIVE]',
    `현재 원고가 ${params.currentLength.toLocaleString()}자로 너무 짧다. 최소 ${params.minCharCount.toLocaleString()}자 이상으로 다시 작성하라.`,
    '- 같은 사건을 반복 요약하지 말고, 장면 밀도를 늘려라.',
    '- 행동-감각-대사의 중간 과정을 생략하지 말고 이어서 전개하라.',
    '- 엔딩 훅까지 도달하되, 중간 장면을 충분히 펼쳐라.',
    '- 출력은 본문만 반환하라.',
  ].join('\n');
}

function buildContinueFromExistingInstruction(
  originalInstruction: string,
  existingContent: string
) {
  const normalized = normalizeSerialParagraphs(existingContent).trim();
  const tail = normalized.slice(-1600);

  return [
    originalInstruction,
    '',
    '[CONTINUE_FROM_EXISTING_DRAFT]',
    '아래 기존 원고를 절대 유지하고, 마지막 문장 다음부터 이어서만 작성하라.',
    '- 기존 원고를 다시 처음부터 재작성하지 마라.',
    '- 출력은 "새로 추가되는 본문"만 반환하라.',
    '- 동일 사건/설명을 반복하지 말고 다음 비트로 전진하라.',
    '',
    '[EXISTING_DRAFT_TAIL]',
    '"""',
    tail,
    '"""',
  ].join('\n');
}

function mergeWithExistingContent(existingContent: string, generatedText: string) {
  const existing = normalizeSerialParagraphs(existingContent).trim();
  const generated = normalizeSerialParagraphs(trimReplayRestart(generatedText)).trim();

  if (!existing) return generated;
  if (!generated) return existing;
  if (generated.startsWith(existing)) return pruneRepeatedTailPassages(generated);

  const continuationOnly = stripContinuationArtifacts(generated);
  if (!continuationOnly) return existing;

  let stripped = stripReplayedContinuationPrefix(existing, continuationOnly);
  if (!stripped.trim()) {
    return existing;
  }

  if (stripped.length > CONTINUATION_APPEND_MAX_CHARS) {
    const rescued = rescueContinuationDelta(existing, continuationOnly);
    if (rescued.length >= CONTINUATION_APPEND_MIN_CHARS) {
      stripped = rescued;
    } else {
      stripped = stripped.slice(-CONTINUATION_APPEND_MAX_CHARS).trim();
    }
  }

  const hadReplayPrefix = stripped.length + 80 < continuationOnly.length;
  const merged = appendContinuation(existing, stripped);
  if (
    merged.length > existing.length &&
    stripped.length >= CONTINUATION_APPEND_MIN_CHARS &&
    (hadReplayPrefix || !looksLikeFullRestart(existing, continuationOnly))
  ) {
    return pruneRepeatedTailPassages(merged);
  }

  if (looksLikeFullRestart(existing, continuationOnly)) {
    const rescued = rescueContinuationDelta(existing, continuationOnly);
    const tailOnly = rescued || continuationOnly.slice(Math.max(0, continuationOnly.length - 1200)).trim();
    const tailMerged = appendContinuation(existing, tailOnly);
    if (tailMerged.length > existing.length + 120) {
      return pruneRepeatedTailPassages(tailMerged);
    }
    return existing;
  }

  return pruneRepeatedTailPassages(merged.length > existing.length ? merged : existing);
}

function rescueContinuationDelta(existingContent: string, generatedText: string): string {
  const existingParagraphs = existingContent
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const generatedParagraphs = generatedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (existingParagraphs.length < 2 || generatedParagraphs.length < 2) {
    return '';
  }

  const existingTail = existingParagraphs.slice(Math.max(0, existingParagraphs.length - 8));
  let lastMatchedGeneratedIndex = -1;

  for (let g = 0; g < generatedParagraphs.length; g += 1) {
    const matched = existingTail.some((tailParagraph) =>
      isParagraphSoftMatch(tailParagraph, generatedParagraphs[g])
    );
    if (matched) {
      lastMatchedGeneratedIndex = g;
    }
  }

  if (lastMatchedGeneratedIndex >= 0 && lastMatchedGeneratedIndex + 1 < generatedParagraphs.length) {
    const delta = generatedParagraphs
      .slice(lastMatchedGeneratedIndex + 1)
      .join('\n\n')
      .trim();
    return delta.length >= CONTINUATION_APPEND_MIN_CHARS ? delta : '';
  }

  return '';
}

function normalizeForContinuity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z\uac00-\ud7a3\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickKeywordsFromAnchor(anchor: string): string[] {
  const stopwords = new Set(['그리고', '그러나', '하지만', '정말', '그녀', '그는', '이브린', '카시안']);
  return normalizeForContinuity(anchor)
    .split(' ')
    .filter((token) => token.length >= 2 && !stopwords.has(token))
    .slice(0, 10);
}

function evaluateOpeningContinuity(content: string, context: SlidingWindowContext): {
  passed: boolean;
  reason: string;
} {
  const contract = context.transitionContract;
  if (!contract) {
    return { passed: true, reason: 'no_transition_contract' };
  }

  const opening = normalizeForContinuity(content.slice(0, 600));
  if (!opening) {
    return { passed: false, reason: 'opening_empty' };
  }

  const keywords = [
    ...pickKeywordsFromAnchor(contract.anchor1),
    ...pickKeywordsFromAnchor(contract.anchor2),
    ...pickKeywordsFromAnchor(contract.anchor3),
  ];

  if (!keywords.length) {
    return { passed: true, reason: 'no_keywords' };
  }

  const uniqueKeywords = Array.from(new Set(keywords));
  const matched = uniqueKeywords.filter((keyword) => opening.includes(keyword));
  const anchor3Keywords = pickKeywordsFromAnchor(contract.anchor3);
  const anchor3Matched = anchor3Keywords.filter((keyword) => opening.includes(keyword)).length;

  if (matched.length >= 2 && anchor3Matched >= 1) {
    return { passed: true, reason: 'ok' };
  }

  return {
    passed: false,
    reason: `matched=${matched.length}, anchor3=${anchor3Matched}`,
  };
}

async function repairOpeningContinuity(params: {
  systemPrompt: string;
  content: string;
  context: SlidingWindowContext;
  targetEpisodeNumber: number;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const contract = params.context.transitionContract;
  if (!contract) {
    return { content: params.content, inputTokens: 0, outputTokens: 0 };
  }

  const boundary = Math.min(
    params.content.length,
    Math.max(
      500,
      (() => {
        const idx = params.content.indexOf('\n\n', 420);
        return idx > 0 ? idx : 680;
      })()
    )
  );

  const opening = params.content.slice(0, boundary).trim();
  const tail = params.content.slice(boundary).trimStart();

  const completion = await generateCompletion({
    systemPrompt: buildContinuationSystemPrompt(params.systemPrompt),
    userPrompt: [
      `Revise only the opening section of episode ${params.targetEpisodeNumber}.`,
      'Do not rewrite the whole episode.',
      'Preserve plot facts and tone.',
      'Must satisfy transition contract anchors below.',
      '',
      '[anchor_1]',
      contract.anchor1 || '-',
      '[anchor_2]',
      contract.anchor2 || '-',
      '[anchor_3]',
      contract.anchor3 || '-',
      '[opening_guardrail]',
      contract.openingGuardrail || '-',
      '',
      '[opening_to_rewrite]',
      opening,
      '',
      'Output only the revised opening prose.',
    ].join('\n'),
    maxTokens: 2200,
    temperature: 0.5,
  });

  const { cleanContent } = parseAndRemoveLogicCheck(completion.text);
  const revisedOpening = stripContinuationArtifacts(cleanContent).trim();
  if (!revisedOpening) {
    return { content: params.content, inputTokens: completion.inputTokens, outputTokens: completion.outputTokens };
  }

  const merged = `${revisedOpening}\n\n${tail}`.trim();
  return {
    content: merged,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}

function alignRangeToParagraph(content: string, start: number, end: number) {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));
  const before = content.lastIndexOf('\n\n', safeStart);
  const after = content.indexOf('\n\n', safeEnd);
  const alignedStart = before >= 0 ? before + 2 : 0;
  const alignedEnd = after >= 0 ? after : content.length;
  if (alignedEnd <= alignedStart) {
    return { start: safeStart, end: safeEnd };
  }
  return { start: alignedStart, end: alignedEnd };
}

async function rewriteSegmentWithValidatorFeedback(params: {
  systemPrompt: string;
  content: string;
  start: number;
  end: number;
  label: 'opening' | 'ending';
  validatorResult: ValidatorResult;
  targetEpisodeNumber: number;
}) {
  const targetRange = alignRangeToParagraph(params.content, params.start, params.end);
  const segment = params.content.slice(targetRange.start, targetRange.end).trim();
  if (!segment) {
    return { content: params.content, applied: false, inputTokens: 0, outputTokens: 0 };
  }

  const failedChecks = params.validatorResult.checks
    .filter((check) => !check.passed)
    .map((check) => `${check.label}: ${check.comment}`)
    .slice(0, 6);
  const suggestions = params.validatorResult.suggestions.slice(0, 6);

  const completion = await generateCompletion({
    systemPrompt: buildContinuationSystemPrompt(params.systemPrompt),
    userPrompt: [
      `Revise only the ${params.label} segment of episode ${params.targetEpisodeNumber}.`,
      'Do not rewrite the whole episode.',
      'Preserve all story facts, character intent, and timeline continuity.',
      'Avoid restarting from the beginning.',
      '',
      '[validator_failed_checks]',
      failedChecks.join('\n') || '-',
      '',
      '[validator_suggestions]',
      suggestions.join('\n') || '-',
      '',
      '[segment_to_rewrite]',
      segment,
      '',
      'Output only the revised segment prose.',
    ].join('\n'),
    maxTokens: 2400,
    temperature: 0.45,
  });

  const { cleanContent } = parseAndRemoveLogicCheck(completion.text);
  const rewritten = stripContinuationArtifacts(cleanContent).trim();
  if (!rewritten) {
    return {
      content: params.content,
      applied: false,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
    };
  }

  const nextContent =
    params.content.slice(0, targetRange.start) +
    rewritten +
    params.content.slice(targetRange.end);

  return {
    content: nextContent,
    applied: true,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}

async function repairSegmentsFromValidator(params: {
  systemPrompt: string;
  content: string;
  validatorResult: ValidatorResult;
  context: SlidingWindowContext;
  targetEpisodeNumber: number;
}) {
  const mergedFeedbackText = [
    params.validatorResult.summary,
    ...params.validatorResult.suggestions,
    ...params.validatorResult.checks.filter((check) => !check.passed).map((check) => check.comment),
  ]
    .join(' ')
    .toLowerCase();

  const failedIds = new Set(
    params.validatorResult.checks.filter((check) => !check.passed).map((check) => check.id)
  );

  const openingFocused =
    /(opening|초반|도입|시작|첫 문장)/.test(mergedFeedbackText) ||
    failedIds.has('consistency') ||
    failedIds.has('continuity');

  const endingFocused =
    /(ending|결말|마무리|엔딩|끝맺)/.test(mergedFeedbackText) ||
    failedIds.has('continuity') ||
    failedIds.has('show_not_tell');

  const shouldPatchOpening = openingFocused;
  const shouldPatchEnding = endingFocused || !openingFocused;

  let nextContent = params.content;
  let applied = false;
  let inputTokens = 0;
  let outputTokens = 0;

  if (shouldPatchOpening) {
    const openingPatch = await rewriteSegmentWithValidatorFeedback({
      systemPrompt: params.systemPrompt,
      content: nextContent,
      start: 0,
      end: Math.min(nextContent.length, 1200),
      label: 'opening',
      validatorResult: params.validatorResult,
      targetEpisodeNumber: params.targetEpisodeNumber,
    });
    nextContent = openingPatch.content;
    applied = applied || openingPatch.applied;
    inputTokens += openingPatch.inputTokens;
    outputTokens += openingPatch.outputTokens;
  }

  if (shouldPatchEnding) {
    const endingPatch = await rewriteSegmentWithValidatorFeedback({
      systemPrompt: params.systemPrompt,
      content: nextContent,
      start: Math.max(0, nextContent.length - 1400),
      end: nextContent.length,
      label: 'ending',
      validatorResult: params.validatorResult,
      targetEpisodeNumber: params.targetEpisodeNumber,
    });
    nextContent = endingPatch.content;
    applied = applied || endingPatch.applied;
    inputTokens += endingPatch.inputTokens;
    outputTokens += endingPatch.outputTokens;
  }

  const openingGate = evaluateOpeningContinuity(nextContent, params.context);
  if (!openingGate.passed) {
    const openingRepair = await repairOpeningContinuity({
      systemPrompt: params.systemPrompt,
      content: nextContent,
      context: params.context,
      targetEpisodeNumber: params.targetEpisodeNumber,
    });
    nextContent = openingRepair.content;
    applied = true;
    inputTokens += openingRepair.inputTokens;
    outputTokens += openingRepair.outputTokens;
  }

  return {
    content: nextContent,
    applied,
    inputTokens,
    outputTokens,
  };
}

function looksLikeFullRestart(existingContent: string, generatedText: string): boolean {
  const existingParagraphs = existingContent
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 8);
  const generatedParagraphs = generatedText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (existingParagraphs.length < 2 || generatedParagraphs.length < 2) return false;
  if (generatedText.length < Math.min(900, Math.floor(existingContent.length * 0.45))) return false;

  let leadMatches = 0;
  for (const g of generatedParagraphs) {
    const matched = existingParagraphs.some((e) => isParagraphSoftMatch(e, g));
    if (matched) leadMatches += 1;
  }

  if (leadMatches >= 2) return true;
  if (
    generatedParagraphs[0] &&
    existingParagraphs[0] &&
    isParagraphSoftMatch(existingParagraphs[0], generatedParagraphs[0]) &&
    generatedText.length >= Math.floor(existingContent.length * 0.6)
  ) {
    return true;
  }

  return false;
}

function pruneRepeatedTailPassages(content: string): string {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs.length < 10) return content.trim();

  for (let i = Math.floor(paragraphs.length * 0.35); i < paragraphs.length - 1; i += 1) {
    for (let j = 0; j <= i - 2; j += 1) {
      if (!isParagraphSoftMatch(paragraphs[j], paragraphs[i])) continue;
      if (!isParagraphSoftMatch(paragraphs[j + 1], paragraphs[i + 1])) continue;

      let run = 0;
      let runChars = 0;
      while (
        j + run < i &&
        i + run < paragraphs.length &&
        isParagraphSoftMatch(paragraphs[j + run], paragraphs[i + run])
      ) {
        runChars += paragraphs[i + run].length;
        run += 1;
        if (run >= 24) break;
      }

      const shouldTrim =
        (run >= 3 && runChars >= 280) ||
        (run >= 2 && runChars >= 520);

      if (shouldTrim) {
        return paragraphs.slice(0, i).join('\n\n').trim();
      }
    }
  }

  return paragraphs.join('\n\n').trim();
}

async function runOpenAIValidator(params: {
  model: string;
  content: string;
  episodeNumber: number;
  context: SlidingWindowContext;
}): Promise<ValidatorResult> {
  const userPrompt = buildValidatorUserPromptV2(params.content, params.episodeNumber, params.context);
  const response = await generateOpenAIText({
    model: params.model,
    systemPrompt: `${VALIDATOR_SYSTEM_PROMPT_V2}\n\n${CAUSALITY_VALIDATION_APPENDIX}`,
    userPrompt,
    temperature: 0.2,
    maxOutputTokens: 1400,
  });

  const parsed = parseValidatorJson(response.text);
  if (!parsed) {
    return {
      overallScore: 20,
      passed: false,
      summary: 'Validator format FAIL: JSON 응답 파싱 실패',
      checks: [
        { id: 'sentence_split', label: defaultCheckLabel('sentence_split'), passed: true, score: 70, comment: '기본값' },
        { id: 'consistency', label: defaultCheckLabel('consistency'), passed: false, score: 10, comment: '검수 모델 응답 형식(JSON) 오류로 자동 FAIL 처리' },
        { id: 'continuity', label: defaultCheckLabel('continuity'), passed: true, score: 70, comment: '기본값' },
        { id: 'show_not_tell', label: defaultCheckLabel('show_not_tell'), passed: true, score: 70, comment: '기본값' },
        { id: 'vocabulary', label: defaultCheckLabel('vocabulary'), passed: true, score: 70, comment: '기본값' },
      ],
      suggestions: ['검수 응답이 JSON 형식이 아니어서 자동 반려되었습니다. 재시도하세요.'],
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      model: params.model,
    };
  }
  const checks = normalizeValidatorChecks(parsed.checks);
  const safeChecks = checks.length ? checks : defaultValidatorChecks();

  let overallScore = clampNumber(
    typeof parsed.overallScore === 'number'
      ? parsed.overallScore
      : Math.round(safeChecks.reduce((sum, check) => sum + check.score, 0) / safeChecks.length)
  );

  let passed =
    typeof parsed.passed === 'boolean'
      ? parsed.passed
      : overallScore >= 70 && safeChecks.every((check) => check.passed);

  let summary =
    typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : passed
      ? '전반적으로 기준을 충족했습니다.'
      : '일부 항목에서 개선이 필요합니다.';

  const suggestions = Array.isArray(parsed.suggestions)
    ? parsed.suggestions
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const consistencyCheck = safeChecks.find((check) => check.id === 'consistency');
  if (consistencyCheck && !consistencyCheck.passed) {
    passed = false;
    overallScore = Math.min(overallScore, 40);
    if (!summary.toLowerCase().includes('synopsis') && !summary.includes('시놉시스')) {
      summary = `Synopsis mismatch FAIL: ${summary}`;
    }
  }

  const baseResult: ValidatorResult = {
    overallScore,
    passed,
    summary,
    checks: safeChecks,
    suggestions,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    model: params.model,
  };

  return enforceFeaturedCharacterGateOnValidator(
    baseResult,
    params.content,
    params.episodeNumber,
    params.context
  );
}

function buildValidatorUserPrompt(
  content: string,
  episodeNumber: number,
  context: SlidingWindowContext
) {
  const synopsis = context.episodeSynopses?.find(
    (row) => row.isCurrent || row.episodeNumber === episodeNumber
  );
  const worldRules = Array.isArray(context.worldBible?.absolute_rules)
    ? context.worldBible.absolute_rules.slice(0, 10).join('\n- ')
    : '';
  const characters = context.activeCharacters
    .slice(0, 12)
    .map(
      (char) =>
        `${char.name} | role:${char.role || 'unknown'} | location:${char.currentLocation || 'unknown'} | emotion:${char.emotionalState || 'unknown'} | speech:${char.speechPattern || 'n/a'}`
    )
    .join('\n');
  const recentLogs = context.recentLogs
    .slice(0, 5)
    .map((log) => `${log.episodeNumber}화: ${truncate(log.summary, 260)}`)
    .join('\n');

  return `
[Simulation Fact Pack]
아래 데이터는 이미 일어난 확정 팩트다. 왜곡 여부를 최우선 검증하라.

[Current Episode Synopsis]
${synopsis?.synopsis || '없음'}

[Key Events]
${synopsis?.keyEvents?.join('\n') || '없음'}

[Forbidden]
${synopsis?.forbidden || '없음'}

[World Rules]
- ${worldRules || '없음'}

[Character Canon]
${characters || '없음'}

[Memory Log]
${recentLogs || '없음'}

[Transition Contract]
${context.transitionContract
  ? [
      `[source:${context.transitionContract!.sourceEpisodeNumber} -> target:${context.transitionContract!.targetEpisodeNumber}]`,
      `anchor1: ${context.transitionContract!.anchor1}`,
      `anchor2: ${context.transitionContract!.anchor2}`,
      `anchor3: ${context.transitionContract!.anchor3}`,
      `guardrail: ${context.transitionContract!.openingGuardrail || '-'}`,
    ].join('\n')
  : '?놁쓬'}

[Previous Character Snapshots]
${(context.previousCharacterSnapshots || [])
  .slice(0, 12)
  .map(
    (item) =>
      `${item.name} | role:${item.role || 'unknown'} | location:${item.location || 'unknown'} | emotion:${item.emotionalState || 'unknown'}`
  )
  .join('\n') || '?놁쓬'}

[Target Draft]
${content}
`;
}

function buildValidatorUserPromptV2(
  content: string,
  episodeNumber: number,
  context: SlidingWindowContext
) {
  const synopsis = context.episodeSynopses?.find(
    (row) => row.isCurrent || row.episodeNumber === episodeNumber
  );
  const worldRules = Array.isArray(context.worldBible?.absolute_rules)
    ? context.worldBible.absolute_rules.slice(0, 10).join('\n- ')
    : '';
  const characters = context.activeCharacters
    .slice(0, 12)
    .map(
      (char) =>
        `${char.name} | role:${char.role || 'unknown'} | location:${char.currentLocation || 'unknown'} | emotion:${char.emotionalState || 'unknown'} | speech:${char.speechPattern || 'n/a'}`
    )
    .join('\n');
  const recentLogs = context.recentLogs
    .slice(0, 5)
    .map((log) => `${log.episodeNumber}화: ${truncate(log.summary, 260)}`)
    .join('\n');

  return `
[Simulation Fact Pack]
아래 데이터는 이미 확정된 팩트이며, 반드시 우선 검증해야 한다.

[Current Episode Synopsis]
${synopsis?.synopsis || '없음'}

[Episode Featured Characters]
${synopsis?.featuredCharacters?.join(', ') || '없음'}

[Key Events]
${synopsis?.keyEvents?.join('\n') || '없음'}

[Forbidden]
${synopsis?.forbidden || '없음'}

[World Rules]
- ${worldRules || '없음'}

[Character Canon]
${characters || '없음'}

[Memory Log]
${recentLogs || '없음'}

[Transition Contract]
${context.transitionContract
  ? [
      `[source:${context.transitionContract!.sourceEpisodeNumber} -> target:${context.transitionContract!.targetEpisodeNumber}]`,
      `anchor1: ${context.transitionContract!.anchor1}`,
      `anchor2: ${context.transitionContract!.anchor2}`,
      `anchor3: ${context.transitionContract!.anchor3}`,
      `guardrail: ${context.transitionContract!.openingGuardrail || '-'}`,
    ].join('\n')
  : '없음'}

[Previous Character Snapshots]
${(context.previousCharacterSnapshots || [])
  .slice(0, 12)
  .map(
    (item) =>
      `${item.name} | role:${item.role || 'unknown'} | location:${item.location || 'unknown'} | emotion:${item.emotionalState || 'unknown'}`
  )
  .join('\n') || '없음'}

[Target Draft]
${content}
`;
}

function enforceFeaturedCharacterGateOnValidator(
  result: ValidatorResult,
  content: string,
  episodeNumber: number,
  context: SlidingWindowContext
): ValidatorResult {
  const synopsis = context.episodeSynopses?.find(
    (item) => item.isCurrent || item.episodeNumber === episodeNumber
  );
  const featured = new Set(
    (synopsis?.featuredCharacters || [])
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.replace(/\s+/g, '').trim())
      .filter(Boolean)
  );

  if (!featured.size) return result;

  const knownNames = context.activeCharacters
    .map((character) => (character.name || '').replace(/\s+/g, '').trim())
    .filter(Boolean);

  const violations = knownNames.filter((name) => {
    if (featured.has(name)) return false;
    const threshold = episodeNumber <= 2 ? 1 : 2;
    return countCharacterMention(content, name) >= threshold;
  });

  if (!violations.length) return result;

  const checks = [...result.checks];
  const consistencyIndex = checks.findIndex((check) => check.id === 'consistency');
  const comment = `허용 외 캐릭터 조기 등장: ${violations.join(', ')}`;
  if (consistencyIndex >= 0) {
    checks[consistencyIndex] = {
      ...checks[consistencyIndex],
      passed: false,
      score: Math.min(checks[consistencyIndex].score, 20),
      comment,
    };
  }

  return {
    ...result,
    overallScore: Math.min(result.overallScore, 40),
    passed: false,
    summary: `Synopsis mismatch FAIL: 허용 외 캐릭터 조기 등장 (${violations.join(', ')})`,
    checks,
    suggestions: [
      ...result.suggestions,
      `이번 화 직접 등장 캐릭터는 ${Array.from(featured).join(', ')} 로 제한하세요.`,
    ].slice(0, 8),
  };
}

function countCharacterMention(content: string, name: string): number {
  if (!name) return 0;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  return content.match(regex)?.length || 0;
}

function parseValidatorJson(raw: string): Record<string, unknown> | null {
  const direct = raw.trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const brace = raw.match(/\{[\s\S]*\}/)?.[0]?.trim();

  const candidates = [direct, fenced, brace].filter(
    (item): item is string => typeof item === 'string' && item.length > 0
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  return null;
}

function normalizeValidatorChecks(raw: unknown): ValidatorCheck[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const id = normalizeCheckId(String(item.id || ''));
      const score = clampNumber(typeof item.score === 'number' ? item.score : 70);
      const passed = typeof item.passed === 'boolean' ? item.passed : score >= 70;
      return {
        id,
        label: (typeof item.label === 'string' && item.label.trim()) || defaultCheckLabel(id),
        passed,
        score,
        comment: (typeof item.comment === 'string' && item.comment.trim()) || '코멘트 없음',
      };
    });
}

function normalizeCheckId(raw: string): ValidatorCheckId {
  const source = raw.toLowerCase();
  if (source.includes('split') || source.includes('sentence')) return 'sentence_split';
  if (source.includes('continu')) return 'continuity';
  if (source.includes('show') || source.includes('tell')) return 'show_not_tell';
  if (source.includes('vocab') || source.includes('era') || source.includes('term')) return 'vocabulary';
  return 'consistency';
}

function defaultValidatorChecks(): ValidatorCheck[] {
  return [
    { id: 'sentence_split', label: defaultCheckLabel('sentence_split'), passed: true, score: 70, comment: '기본값' },
    { id: 'consistency', label: defaultCheckLabel('consistency'), passed: true, score: 70, comment: '기본값' },
    { id: 'continuity', label: defaultCheckLabel('continuity'), passed: true, score: 70, comment: '기본값' },
    { id: 'show_not_tell', label: defaultCheckLabel('show_not_tell'), passed: true, score: 70, comment: '기본값' },
    { id: 'vocabulary', label: defaultCheckLabel('vocabulary'), passed: true, score: 70, comment: '기본값' },
  ];
}

function defaultCheckLabel(id: ValidatorCheckId) {
  switch (id) {
    case 'sentence_split':
      return '문장 호흡';
    case 'consistency':
      return '팩트 일치(시놉시스/세계관)';
    case 'continuity':
      return '기억 로그 연속성';
    case 'show_not_tell':
      return 'Show, Don\'t Tell';
    case 'vocabulary':
      return '시대 어휘';
  }
}

function clampNumber(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function truncate(value: string, max: number) {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
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

function createQualityStageEvent(params: {
  status: StageProgressEvent['status'];
  overallScore?: number;
  passed?: boolean;
  suggestionCount?: number;
  summary?: string;
}): StageProgressEvent {
  const now = new Date().toISOString();

  return {
    stage: 'quality',
    status: params.status,
    provider: 'openai',
    model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4o',
    startedAt: now,
    completedAt: params.status === 'running' ? undefined : now,
    summary: params.summary,
    metadata: {
      overallScore: params.overallScore,
      passed: params.passed,
      suggestionCount: params.suggestionCount,
    },
  };
}

function createRetryingStageEvent(params: {
  status: StageProgressEvent['status'];
  attempt: number;
  maxAttempts: number;
  summary?: string;
  reason?: string;
}): StageProgressEvent {
  const now = new Date().toISOString();

  return {
    stage: 'retrying',
    status: params.status,
    provider: 'system',
    model: 'auto-retry',
    startedAt: now,
    completedAt: params.status === 'running' ? undefined : now,
    summary:
      params.summary ||
      `검수 반려됨: 재작성 중 (${params.attempt}/${params.maxAttempts})...`,
    metadata: {
      attempt: params.attempt,
      maxAttempts: params.maxAttempts,
      reason: params.reason,
    },
  };
}

async function expandEpisodeToMinimumLength(params: {
  systemPrompt: string;
  content: string;
  targetEpisodeNumber: number;
  targetCharCount: number;
  enqueueStatus: (message: string) => void;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const { systemPrompt, targetEpisodeNumber, enqueueStatus, targetCharCount } = params;

  let content = params.content;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 1; attempt <= CONTINUATION_MAX_ATTEMPTS; attempt += 1) {
    if (content.length >= targetCharCount) {
      break;
    }

    const shortfall = targetCharCount - content.length;
    enqueueStatus(
      `분량 보정 중... (${content.length.toLocaleString()} / ${MIN_CHAR_COUNT.toLocaleString()})`
    );

    const continuation = await generateCompletion({
      systemPrompt: buildContinuationSystemPrompt(systemPrompt),
      userPrompt: buildContinuationUserPrompt(content, targetEpisodeNumber, shortfall, attempt),
      maxTokens: 6144,
      temperature: 0.72,
    });

    inputTokens += continuation.inputTokens;
    outputTokens += continuation.outputTokens;

    const { cleanContent } = parseAndRemoveLogicCheck(continuation.text);
    const addition = stripContinuationArtifacts(cleanContent);
    if (!addition) break;

    const mergedContent = appendContinuation(content, addition);
    if (mergedContent.length <= content.length) break;
    content = mergedContent;
  }

  return { content, inputTokens, outputTokens };
}

function buildContinuationSystemPrompt(baseSystemPrompt: string): string {
  return `${baseSystemPrompt}

<continuation_mode>
Continue the current draft naturally.
Do not restart the episode.
Do not print planning labels.
Output prose only.
</continuation_mode>`;
}

function buildContinuationUserPrompt(
  content: string,
  targetEpisodeNumber: number,
  shortfall: number,
  attempt: number
): string {
  const requestedChars = Math.min(1400, Math.max(700, shortfall + 250));
  const tail = content.slice(-1400);
  const firstEpisodeReminder =
    targetEpisodeNumber === 1
      ? '\n- Keep the protagonist impression, world hint, and next-episode curiosity sharp.'
      : '';

  return `Continue episode ${targetEpisodeNumber} from the exact tail below.

Current length: ${content.length}
Shortfall: at least ${shortfall}
Requested expansion target: about ${requestedChars}
Attempt: ${attempt}/${CONTINUATION_MAX_ATTEMPTS}

Rules:
- Continue from the next beat immediately.
- If the same clue/event is already resolved, do not restate it.
- Advance consequence/action, not recap.
- Output prose only.
- Strengthen scene density and ending hook.
- Focus on one new beat and a clean ending.
${firstEpisodeReminder}

Tail:
"""
${tail}
"""`;
}

function stripContinuationArtifacts(text: string): string {
  return text
    .replace(/^\s*\[Prose\]\s*/i, '')
    .replace(/^\s*```(?:text)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function appendContinuation(existingContent: string, addition: string): string {
  const normalizedExisting = existingContent.trimEnd();
  const normalizedAddition = stripReplayedContinuationPrefix(
    normalizedExisting,
    addition.trimStart()
  );
  if (!normalizedAddition) {
    return normalizedExisting;
  }
  const maxOverlap = Math.min(240, normalizedExisting.length, normalizedAddition.length);

  for (let overlap = maxOverlap; overlap >= 20; overlap -= 1) {
    if (normalizedExisting.slice(-overlap) === normalizedAddition.slice(0, overlap)) {
      return normalizedExisting + normalizedAddition.slice(overlap);
    }
  }

  if (!normalizedExisting) {
    return normalizedAddition;
  }

  const joiner = normalizedExisting.endsWith('\n') ? '\n' : '\n\n';
  return normalizedExisting + joiner + normalizedAddition;
}

function stripReplayedContinuationPrefix(existing: string, addition: string): string {
  const existingParagraphs = existing
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const additionParagraphs = addition
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (existingParagraphs.length < 3 || additionParagraphs.length < 2) {
    return addition;
  }

  for (let i = 0; i <= existingParagraphs.length - 2; i += 1) {
    if (
      !isParagraphSoftMatch(existingParagraphs[i], additionParagraphs[0]) ||
      !isParagraphSoftMatch(existingParagraphs[i + 1], additionParagraphs[1])
    ) {
      continue;
    }

    let run = 0;
    while (
      i + run < existingParagraphs.length &&
      run < additionParagraphs.length &&
      isParagraphSoftMatch(existingParagraphs[i + run], additionParagraphs[run])
    ) {
      run += 1;
    }

    if (run >= 2) {
      return additionParagraphs.slice(run).join('\n\n').trim();
    }
  }

  return addition;
}

function isParagraphSoftMatch(a: string, b: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^0-9a-z\uac00-\ud7a3\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;

  const leftTokens = new Set(left.split(' ').filter((token) => token.length >= 2));
  const rightTokens = new Set(right.split(' ').filter((token) => token.length >= 2));
  if (!leftTokens.size || !rightTokens.size) return false;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;

  return jaccard >= 0.5;
}

async function ensureCompleteEnding(params: {
  systemPrompt: string;
  content: string;
  targetEpisodeNumber: number;
  enqueueStatus: (message: string) => void;
}): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  let content = params.content;
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 1; attempt <= ENDING_COMPLETION_MAX_ATTEMPTS; attempt += 1) {
    if (!isLikelyTruncatedEnding(content)) break;

    params.enqueueStatus(
      `문장 종결 보정 중... (${attempt}/${ENDING_COMPLETION_MAX_ATTEMPTS})`
    );

    const completion = await generateCompletion({
      systemPrompt: buildContinuationSystemPrompt(params.systemPrompt),
      userPrompt: buildEndingCompletionPrompt(
        content,
        params.targetEpisodeNumber,
        attempt
      ),
      maxTokens: 1024,
      temperature: 0.65,
    });

    inputTokens += completion.inputTokens;
    outputTokens += completion.outputTokens;

    const { cleanContent } = parseAndRemoveLogicCheck(completion.text);
    const addition = stripContinuationArtifacts(cleanContent);
    if (!addition) break;

    const merged = appendContinuation(content, addition);
    if (merged.length <= content.length) break;
    content = merged;
  }

  return { content, inputTokens, outputTokens };
}

function buildEndingCompletionPrompt(
  content: string,
  targetEpisodeNumber: number,
  attempt: number
): string {
  const tail = content.slice(-1200);

  return `Episode ${targetEpisodeNumber} draft tail seems cut mid-sentence.
Complete ONLY the cut-off ending naturally.
Do not restart the episode.
Do not summarize previous events.
Write prose only.
Attempt: ${attempt}/${ENDING_COMPLETION_MAX_ATTEMPTS}

Tail:
"""
${tail}
"""`;
}

function isLikelyTruncatedEnding(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return true;

  const lastChar = trimmed.slice(-1);
  if (/[.!?…'"”’)\]」』]/.test(lastChar)) return false;

  const lastFragment = trimmed.slice(-40);
  if (/[가-힣a-zA-Z0-9]$/.test(lastChar)) {
    // 보통 한국어 문장 종결은 '.', '다', '요' 등으로 닫히는데,
    // 한 글자 어절/미완성 절(예: "흡사 마")은 잘림 가능성이 높다.
    if (/\s[가-힣a-zA-Z]$/.test(lastFragment)) return true;
  }

  return true;
}

function trimIncompleteTail(content: string): string {
  const trimmed = content.trimEnd();
  if (!trimmed) return trimmed;

  const tailWindow = 900;
  const start = Math.max(0, trimmed.length - tailWindow);
  const tail = trimmed.slice(start);

  for (let i = tail.length - 1; i >= 0; i -= 1) {
    if (/[.!?"]/.test(tail[i])) {
      const cutoff = start + i + 1;
      return trimmed.slice(0, cutoff).trimEnd();
    }
  }

  return trimmed;
}

export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/ai/generate-episode',
      method: 'POST',
      description: 'Simulation-based novelization API (Claude writer + OpenAI auto-validator)',
      requiredEnv: ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
      body: {
        projectId: 'string',
        targetEpisodeNumber: 'number',
        userInstruction: 'string',
        windowSize: 'number',
        longTermSearchQueries: 'string[]',
        saveToDb: 'boolean',
      },
      responseFormat: 'SSE',
      messageTypes: {
        heartbeat: 'status update',
        stage: 'pipeline stage event',
        complete: 'final PASS-validated prose',
        metadata: 'validation/pipeline summary',
        error: 'generation or validation error',
      },
      limits: {
        recommendedCharCount: RECOMMENDED_CHAR_COUNT,
        minAcceptableCharCount: MIN_ACCEPTABLE_CHAR_COUNT,
        maxCharCount: MAX_CHAR_COUNT,
        autoRetryMaxAttempts: AUTO_RETRY_MAX_ATTEMPTS,
      },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
