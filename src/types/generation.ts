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
