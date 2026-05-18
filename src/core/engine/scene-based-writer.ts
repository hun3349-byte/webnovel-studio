/**
 * Scene-Based Writer (Phase 3)
 *
 * 4분할 씬 기반 작성 모드
 * - 각 씬 생성 시 이전 씬 전체를 컨텍스트에 포함
 * - 일관성 유지를 위해 씬 간 연결 강화
 */

import { buildClaudeProsePrompts } from '@/core/engine/prompts/claude-prose';
import { resolveModelRoute } from '@/core/engine/model-router';
import { generateEpisodeStreaming } from '@/lib/ai/claude-client';
import type {
  SceneBasedWritingInput,
  SceneBasedWritingResult,
  SceneGenerationRequest,
  SceneGenerationResult,
  PromptMetadata,
} from '@/types/generation';
import type { SlidingWindowContext } from '@/types/memory';

/**
 * 씬 기반으로 에피소드 전체를 생성
 */
export async function generateEpisodeByScenes(
  input: SceneBasedWritingInput
): Promise<SceneBasedWritingResult> {
  const startedAt = Date.now();
  const scenes: SceneGenerationResult[] = [];
  const previousSceneTexts: string[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let promptMetadata: PromptMetadata = {
    appliedWritingMemoryIds: [],
    appliedWritingMemoryCount: 0,
    appliedWritingDna: false,
    appliedSerialStyle: false,
    appliedFirstEpisodeDirective: false,
  };

  // 4개 씬을 순차적으로 생성
  for (let i = 0; i < 4; i++) {
    const sceneNumber = (i + 1) as 1 | 2 | 3 | 4;

    input.onHeartbeat?.(`씬 ${sceneNumber}/4 생성 중...`);
    input.onStageUpdate?.({
      stage: 'prose',
      status: 'running',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      startedAt: new Date().toISOString(),
      summary: `씬 ${sceneNumber} 생성 중 (이전 ${previousSceneTexts.length}개 씬 컨텍스트 포함)`,
    });

    const sceneRequest: SceneGenerationRequest = {
      projectId: input.projectId,
      targetEpisodeNumber: input.targetEpisodeNumber,
      sceneNumber,
      sceneBeats: input.sceneBeats[i],
      previousScenes: [...previousSceneTexts],
      userInstruction: input.userInstruction,
      context: input.context,
    };

    const sceneResult = await generateSingleScene(sceneRequest);

    // 메타데이터는 첫 씬에서만 가져옴 (동일한 컨텍스트)
    if (i === 0) {
      promptMetadata = sceneResult.promptMetadata;
    }

    scenes.push({
      sceneNumber,
      content: sceneResult.content,
      charCount: sceneResult.content.length,
      inputTokens: sceneResult.inputTokens,
      outputTokens: sceneResult.outputTokens,
      latencyMs: sceneResult.latencyMs,
    });

    previousSceneTexts.push(sceneResult.content);
    totalInputTokens += sceneResult.inputTokens;
    totalOutputTokens += sceneResult.outputTokens;

    input.onSceneComplete?.(scenes[i]);
    input.onStageUpdate?.({
      stage: 'prose',
      status: 'completed',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: `씬 ${sceneNumber} 완료 (${sceneResult.content.length.toLocaleString()}자)`,
      metadata: {
        charCount: sceneResult.content.length,
        inputTokens: sceneResult.inputTokens,
        outputTokens: sceneResult.outputTokens,
      },
    });
  }

  // 4개 씬을 하나의 본문으로 합침
  const fullText = scenes.map((s) => s.content).join('\n\n');
  const totalLatencyMs = Date.now() - startedAt;

  return {
    mode: 'scene_based',
    fullText,
    scenes,
    totalCharCount: fullText.length,
    totalInputTokens,
    totalOutputTokens,
    totalLatencyMs,
    promptMetadata,
  };
}

/**
 * 개별 씬 생성
 */
async function generateSingleScene(
  request: SceneGenerationRequest
): Promise<SceneGenerationResult & { promptMetadata: PromptMetadata }> {
  const startedAt = Date.now();
  const route = resolveModelRoute({ requestedMode: 'claude_legacy' });

  // 씬별 컨텍스트 구축 (이전 씬들 포함)
  const sceneContext = buildSceneContext(request);

  // 프롬프트 생성
  const prompts = await buildClaudeProsePrompts({
    context: sceneContext,
    userInstruction: buildSceneInstruction(request),
    targetEpisodeNumber: request.targetEpisodeNumber,
    projectId: request.projectId,
    commercialPlan: null,
  });

  // 씬 생성
  let content = '';
  const result = await generateEpisodeStreaming({
    model: route.proseModel,
    systemPrompt: prompts.systemPrompt,
    userPrompt: prompts.userPrompt,
    maxTokens: 4096, // 씬당 약 2,500자 목표
    temperature: 0.8,
    onTextChunk: (chunk) => {
      content += chunk;
    },
  });

  const latencyMs = Date.now() - startedAt;

  return {
    sceneNumber: request.sceneNumber,
    content: result.fullText,
    charCount: result.fullText.length,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    latencyMs,
    promptMetadata: prompts.metadata,
  };
}

/**
 * 씬별 컨텍스트 구축
 * - 이전 씬들을 lastSceneAnchor에 추가
 */
function buildSceneContext(request: SceneGenerationRequest): SlidingWindowContext {
  const { context, previousScenes, sceneNumber } = request;

  // 이전 씬이 있으면 마지막 씬의 끝부분을 앵커로 설정
  let lastSceneAnchor = context.lastSceneAnchor || '';
  let previousEpisodeEnding = context.previousEpisodeEnding || '';

  if (previousScenes.length > 0) {
    // 이전 씬들 전체를 previousEpisodeEnding에 포함
    const allPreviousScenes = previousScenes.join('\n\n');
    previousEpisodeEnding = allPreviousScenes;

    // 마지막 씬의 끝 500자를 앵커로
    const lastScene = previousScenes[previousScenes.length - 1];
    lastSceneAnchor = lastScene.slice(-500);
  }

  return {
    ...context,
    lastSceneAnchor,
    previousEpisodeEnding,
  };
}

/**
 * 씬별 지시사항 구축
 */
function buildSceneInstruction(request: SceneGenerationRequest): string {
  const { sceneNumber, sceneBeats, previousScenes, userInstruction } = request;

  const scenePosition = getScenePosition(sceneNumber);
  const previousScenesInfo =
    previousScenes.length > 0
      ? `\n\n[이전 씬 요약]\n${previousScenes.map((s, i) => `씬 ${i + 1}: ${s.slice(0, 200)}...`).join('\n')}`
      : '';

  return `${userInstruction}

=== 씬 ${sceneNumber}/4 작성 지시 ===

[씬 위치]: ${scenePosition}
[이 씬의 비트]: ${sceneBeats}
${previousScenesInfo}

[중요 규칙]
1. 이 씬은 전체 에피소드의 ${sceneNumber}/4 부분입니다.
2. ${sceneNumber === 1 ? '에피소드의 시작으로, 직전 회차와 자연스럽게 연결되어야 합니다.' : ''}
3. ${sceneNumber === 4 ? '에피소드의 마무리로, 다음 회차로 이어질 클리프행어나 여운을 남겨야 합니다.' : ''}
4. ${previousScenes.length > 0 ? '위 이전 씬들과 자연스럽게 연결되어야 합니다. 인물/상황/감정의 흐름을 이어가세요.' : ''}
5. 이 씬에서 다뤄야 할 핵심: ${sceneBeats}
6. 약 2,000~3,000자 분량으로 작성하세요.

본문만 출력하세요. 메타 코멘트나 설명 없이 순수 소설 본문만 작성합니다.`;
}

/**
 * 씬 위치 설명
 */
function getScenePosition(sceneNumber: 1 | 2 | 3 | 4): string {
  switch (sceneNumber) {
    case 1:
      return '도입부 (Opening) - 상황 설정, 직전 회차 연결';
    case 2:
      return '전개부 (Rising) - 갈등/사건 심화';
    case 3:
      return '절정부 (Climax) - 핵심 사건, 감정 폭발';
    case 4:
      return '마무리 (Ending) - 여운, 클리프행어, 다음 회차 복선';
    default:
      return '';
  }
}
