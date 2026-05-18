import type { SlidingWindowContext } from '@/types/memory';

export type GenerationMode =
  | 'claude_legacy'
  | 'hybrid_gpt_claude'
  | 'hybrid_gpt_claude_punchup';

export type GenerationStageName = 'planner' | 'prose' | 'punchup';
export type GenerationStageStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed';

export type GenerationProvider = 'anthropic' | 'openai' | 'system';

export interface PlannerSceneBeat {
  sceneNumber: number;
  purpose: string;
  conflict: string;
  turn: string;
  hook: string;
}

export interface CommercialPlan {
  openingHook: string;
  scenePlan: PlannerSceneBeat[];
  microConflicts: string[];
  endingHook: string;
  dialoguePunch: string[];
  continuityChecklist: string[];
  synopsisAnchors: string[];
  rawText?: string;
}

export interface PromptArtifacts {
  systemPrompt: string;
  userPrompt: string;
}

export interface PromptMetadata {
  appliedWritingMemoryIds: string[];
  appliedWritingMemoryCount: number;
  appliedWritingDna: boolean;
  appliedSerialStyle: boolean;
  appliedFirstEpisodeDirective: boolean;
}

export interface ModelRoute {
  requestedMode: GenerationMode;
  resolvedMode: GenerationMode;
  plannerModel: string | null;
  proseModel: string;
  punchupModel: string | null;
  plannerProvider: GenerationProvider | null;
  proseProvider: GenerationProvider;
  punchupProvider: GenerationProvider | null;
  fallbackReason?: string;
}

export interface GenerationTraceStage {
  stage: GenerationStageName;
  provider: GenerationProvider;
  model: string;
  startedAt: string;
  completedAt?: string;
  status: GenerationStageStatus;
  hiddenOutput?: string;
  promptPreview?: {
    systemLength: number;
    userLength: number;
  };
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface StageProgressEvent {
  stage: GenerationStageName | 'quality' | 'retrying';
  status: GenerationStageStatus;
  provider: GenerationProvider | 'system';
  model: string;
  startedAt: string;
  completedAt?: string;
  summary?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

export interface EpisodeGenerationTrace {
  route: ModelRoute;
  promptMetadata: PromptMetadata;
  stages: GenerationTraceStage[];
  plannerOutput?: CommercialPlan | null;
  validation?: {
    overallScore?: number;
    passed?: boolean;
    suggestions?: string[];
  };
  traceId?: string;
}

export interface WritingOrchestratorInput {
  projectId: string;
  targetEpisodeNumber: number;
  userInstruction: string;
  context: SlidingWindowContext;
  requestedMode?: GenerationMode;
  compareModes?: boolean;
  onHeartbeat?: (message: string) => void;
  onTextChunk?: (chunk: string) => void;
  onStageUpdate?: (event: StageProgressEvent) => void;
}

export interface WritingOrchestratorResult {
  mode: GenerationMode;
  route: ModelRoute;
  fullText: string;
  inputTokens: number;
  outputTokens: number;
  metrics?: GenerationRunMetrics;
  promptMetadata: PromptMetadata;
  prosePrompts: PromptArtifacts;
  trace: EpisodeGenerationTrace;
  comparison?: GenerationComparisonSummary;
}

export interface DryRunPromptSummary {
  mode: GenerationMode;
  plannerEnabled: boolean;
  punchupEnabled: boolean;
  proseProvider: GenerationProvider;
  plannerProvider: GenerationProvider | null;
  punchupProvider: GenerationProvider | null;
  prosePromptLength: number;
  plannerPromptLength?: number;
  estimatedCostUsd?: number;
  estimatedLatencyMs?: number;
  modelSummary?: string;
  fallbackReason?: string;
}

export interface GenerationCostSummary {
  estimatedCostUsd: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface GenerationRunMetrics {
  totalLatencyMs?: number;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
}

export interface CompareExcerptSet {
  opening: string;
  ending: string;
  dialogue: string[];
}

export interface CompareCandidateResult {
  id: string;
  label: string;
  mode: GenerationMode;
  blindedLabel: string;
  content?: string;
  charCount: number;
  validatorScore?: number;
  openingScore?: number;
  endingScore?: number;
  latencyMs?: number;
  estimatedCostUsd?: number;
  modelSummary?: string;
  fallbackReason?: string;
  excerpts: CompareExcerptSet;
}

export interface GenerationComparisonSummary {
  requestedMode: GenerationMode;
  candidates: DryRunPromptSummary[];
}

export interface GenerationComparisonResult {
  requestedMode: GenerationMode;
  blindMode: boolean;
  candidates: CompareCandidateResult[];
}

// ============================================
// Phase 3: 씬 기반 작성 모드 타입
// ============================================

/**
 * 개별 씬 생성 요청
 */
export interface SceneGenerationRequest {
  projectId: string;
  episodeId?: string;
  targetEpisodeNumber: number;
  sceneNumber: 1 | 2 | 3 | 4;
  sceneBeats: string;           // 이 씬에서 일어날 일 (PD 지시)
  previousScenes: string[];     // 이전에 생성된 씬들 (전체 텍스트)
  userInstruction: string;      // 전체 에피소드 지시사항
  context: SlidingWindowContext;
}

/**
 * 개별 씬 생성 결과
 */
export interface SceneGenerationResult {
  sceneNumber: 1 | 2 | 3 | 4;
  content: string;
  charCount: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

/**
 * 씬 기반 에피소드 생성 입력
 */
export interface SceneBasedWritingInput extends Omit<WritingOrchestratorInput, 'onTextChunk'> {
  sceneBeats: [string, string, string, string];  // 4개 씬별 비트
  onSceneComplete?: (scene: SceneGenerationResult) => void;
}

/**
 * 씬 기반 에피소드 생성 결과
 */
export interface SceneBasedWritingResult {
  mode: 'scene_based';
  fullText: string;
  scenes: SceneGenerationResult[];
  totalCharCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  promptMetadata: PromptMetadata;
}

/**
 * 씬 비트 (PD가 지정하는 씬별 대본)
 */
export interface SceneBeat {
  sceneNumber: 1 | 2 | 3 | 4;
  beat: string;                 // 이 씬의 핵심 내용
  estimatedChars?: number;      // 예상 글자수 (선택)
}
