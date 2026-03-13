import type { Database } from './database';

type DBWorldBible = Database['public']['Tables']['world_bibles']['Row'];

/**
 * 프롬프트용 WorldBible (DB 타입과 호환, 추가 필드 허용)
 */
export interface WorldBibleContext {
  id: string;
  project_id: string;
  world_name: string | null;
  time_period: string | null;
  geography: string | null;
  power_system_name: string | null;
  power_system_ranks: unknown;
  power_system_rules: string | null;
  absolute_rules: unknown;
  forbidden_elements: string[] | null;
  additional_settings: unknown;
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * 타임라인 이벤트 (매크로 스토리 연표)
 */
export interface TimelineEvent {
  id: string;
  eventName: string;
  eventType: 'arc_start' | 'arc_climax' | 'arc_end' | 'major_conflict' |
             'milestone' | 'turning_point' | 'setup' | 'cooldown';
  episodeStart: number;
  episodeEnd: number;
  location: string | null;
  mainConflict: string | null;
  objectives: string[];
  constraints: string[];
  foreshadowingSeeds: string[];
  keyCharacters: string[];
  characterFocus: string | null;
  tone: string | null;
  pacing: 'slow' | 'moderate' | 'fast' | 'climactic' | null;
  importance: number;
  status: 'planned' | 'in_progress' | 'completed' | 'modified';
}

/**
 * 현재 아크 요약 정보
 */
export interface CurrentArcSummary {
  arcName: string;
  position: 'start' | 'middle' | 'climax' | 'end';
  progressPercentage: number;
  mainDirective: string;
}

/**
 * 에피소드 시놉시스 (Story Bible)
 * V9.0: 감정 곡선, 마지막 장면 이미지, 금지사항, 씬 대본 필드 추가
 */
export interface EpisodeSynopsis {
  episodeNumber: number;
  title: string | null;
  synopsis: string;
  goals: string[] | null;
  keyEvents: string[] | null;
  featuredCharacters: string[] | null;
  location: string | null;
  timeContext: string | null;
  arcName: string | null;
  arcPosition: string | null;
  foreshadowing: string[] | null;
  callbacks: string[] | null;
  isCurrent: boolean;

  // V9.0 신규 필드
  emotionCurve?: string | null;   // "긴장→공포→분노→각성"
  endingImage?: string | null;    // "손끝의 나뭇잎이 갈라진다"
  forbidden?: string | null;      // "정체 노출 금지"
  sceneBeats?: string | null;     // PD가 직접 짜주는 씬별 대본 (선택사항)
}

/**
 * 슬라이딩 윈도우 컨텍스트
 * AI에게 전달될 모든 컨텍스트 정보를 담는 객체
 */
export interface SlidingWindowContext {
  // 세계관 절대 규칙
  worldBible: WorldBibleContext | DBWorldBible;

  // 직전 N개 에피소드 로그 (최신순)
  recentLogs: EpisodeLogSummary[];

  // 마지막 문장 앵커 (직전 회차의 마지막 500자)
  lastSceneAnchor: string;

  // ★★★ 직전 회차 본문 마지막 1500자 (이어쓰기 강제용) ★★★
  previousEpisodeEnding?: string;

  // 현재 활성 캐릭터들의 상태
  activeCharacters: CharacterCurrentState[];

  // 미해결 떡밥 목록
  unresolvedHooks: UnresolvedHook[];

  // 학습된 문체 선호도
  writingPreferences: WritingPreference[];

  // 장기 기억 검색 결과 (특정 캐릭터/사건 관련)
  longTermMemories?: LongTermMemoryResult[];

  // 현재 회차에 해당하는 타임라인 이벤트들 (매크로 스토리 연표)
  activeTimelineEvents?: TimelineEvent[];

  // 현재 아크 요약 정보
  currentArcSummary?: CurrentArcSummary;

  // ★ 에피소드 시놉시스 (Story Bible) - 현재 회차 기준 앞뒤 시놉시스
  episodeSynopses?: EpisodeSynopsis[];
}

/**
 * 에피소드 로그 요약 (슬라이딩 윈도우용)
 */
export interface EpisodeLogSummary {
  episodeNumber: number;
  summary: string;
  last500Chars: string;
  isFallback: boolean;
  characterStates?: CharacterStateChange[];
  itemChanges?: ItemChange[];
}

/**
 * 캐릭터 현재 상태 (슬라이딩 윈도우용)
 */
export interface CharacterCurrentState {
  id: string;
  name: string;
  role: string | null;
  isAlive: boolean;
  currentLocation: string | null;
  emotionalState: string | null;
  injuries: string[];
  possessedItems: string[];
  // 캐릭터 기본 정보 (프롬프트 주입용)
  personality?: string | null;
  backstory?: string | null;
  speechPattern?: string | null;
  appearance?: string | null;
  goals?: string[];
  // 동적 캐릭터 관리용 추가 데이터
  additionalData?: {
    is_auto_extracted?: boolean;
    extraction_confidence?: number;
    first_action?: string;
    initial_relationship?: string;
    tier?: 1 | 2 | 3;
    tier_upgraded_at?: string;
    previous_tier?: number;
    [key: string]: unknown;
  } | null;
}

// ActiveCharacter 별칭 (prompt-injector 호환용)
export type ActiveCharacter = CharacterCurrentState;

/**
 * 캐릭터 상태 변화 (에피소드별)
 */
export interface CharacterStateChange {
  characterId: string;
  characterName: string;
  changes: string[];
  emotionalArc?: string;
  injuriesGained?: string[];
  injuriesHealed?: string[];
}

/**
 * 아이템 변화
 */
export interface ItemChange {
  changeType: 'gained' | 'lost' | 'transferred' | 'destroyed';
  itemName: string;
  characterId?: string;
  characterName?: string;
  transferredToCharacterName?: string;
}

/**
 * 미해결 떡밥
 */
export interface UnresolvedHook {
  id: string;
  hookType: string;
  summary: string;
  importance: number;
  createdInEpisodeNumber: number;
  keywords: string[];
}

/**
 * 문체 선호도
 */
export interface WritingPreference {
  feedbackType: string;
  preferenceSummary: string | null;
  avoidPatterns: string[];
  favorPatterns: string[];
  confidence: number;
}

/**
 * 장기 기억 검색 결과
 */
export interface LongTermMemoryResult {
  characterId: string;
  characterName: string;
  memoryType: string;
  memorySummary: string;
  sourceEpisodeNumber: number | null;
  importance: number;
}

/**
 * 에피소드 생성 요청
 */
export interface EpisodeGenerationRequest {
  projectId: string;
  targetEpisodeNumber: number;
  userInstruction: string;
  windowSize?: number;

  // 선택적: 특정 캐릭터/사건 검색 쿼리 (장기 기억용)
  longTermSearchQueries?: string[];

  // 생성 후 DB에 저장할지 여부 (기본값: true)
  saveToDb?: boolean;
}

/**
 * 에피소드 생성 결과
 */
export interface EpisodeGenerationResult {
  content: string;
  charCount: number;
  cliffhangerScore: number;
  showDontTellScore: number;

  // 검증 결과
  validation: {
    passed: boolean;
    issues: string[];
  };
}

/**
 * 로그 압축 결과 (AI 응답 구조)
 */
export interface LogCompressionResult {
  summary: string;
  characterStates: Record<string, {
    changes: string[];
    emotionalArc?: string;
  }>;
  itemChanges: {
    gained: string[];
    lost: string[];
  };
  relationshipChanges: Array<{
    characters: string[];
    change: string;
  }>;
  foreshadowing: string[];
  resolvedHooks: string[];
}

/**
 * 재시도 큐 아이템
 */
export interface LogQueueItem {
  id: string;
  episodeId: string;
  projectId: string;
  queueStatus: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
}
