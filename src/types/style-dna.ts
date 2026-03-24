// ============================================================================
// Style Evolution Engine - Type Definitions
// ============================================================================

/**
 * 모범 예시 샘플
 */
export interface BestSample {
  category: 'prose' | 'dialogue' | 'action' | 'emotion' | 'transition' | 'rhythm';
  badExample?: string;    // 피해야 할 예시 (선택)
  goodExample: string;    // 모범 예시
  explanation?: string;   // 설명 (왜 좋은지)
}

/**
 * StyleDNA 공통 요소
 */
export interface StyleDNAElement {
  proseStyle: string | null;        // 문체 특성 (200자 권장)
  rhythmPattern: string | null;     // 리듬 패턴
  dialogueStyle: string | null;     // 대화체 스타일
  emotionExpression: string | null; // 감정 표현 방식
  sceneTransition: string | null;   // 장면 전환 기법
  actionDescription: string | null; // 액션/전투 묘사 방식
}

/**
 * 개별 StyleDNA (레퍼런스/PD피드백/수동)
 */
export interface StyleDNA extends StyleDNAElement {
  id: string;
  projectId: string;
  sourceName: string;                 // "화산귀환", "PD_피드백_12화"
  sourceType: 'reference' | 'pd_feedback' | 'manual';
  bestSamples: BestSample[];
  avoidPatterns: string[];            // 피해야 할 패턴
  favorPatterns: string[];            // 권장 패턴
  confidence: number;                 // 0~1 신뢰도
  weight: number;                     // 합성 시 가중치 (기본 1.0, PD피드백은 2.0)
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 합성된 StyleDNA (프로젝트당 1개)
 */
export interface MergedStyleDNA extends StyleDNAElement {
  id: string;
  projectId: string;
  bestSamples: BestSample[];
  avoidPatterns: string[];
  favorPatterns: string[];
  sourceCount: number;                // 합성에 사용된 DNA 수
  referenceCount: number;             // 레퍼런스 DNA 수
  pdFeedbackCount: number;            // PD 피드백 DNA 수
  averageConfidence: number;
  version: number;
  lastMergedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 스타일 분석 요청
 */
export interface StyleAnalysisRequest {
  projectId: string;
  text: string;                       // 분석할 텍스트 (레퍼런스 소설 샘플)
  sourceName: string;                 // 출처 이름
  sourceType?: 'reference' | 'pd_feedback' | 'manual';
}

/**
 * 스타일 분석 결과 (AI 응답)
 */
export interface StyleAnalysisResult extends StyleDNAElement {
  bestSamples: BestSample[];
  avoidPatterns: string[];
  favorPatterns: string[];
  confidence: number;
}

/**
 * PD 피드백 학습 요청
 */
export interface FeedbackLearningRequest {
  projectId: string;
  episodeNumber: number;
  originalText: string;               // AI 생성 원본
  editedText: string;                 // PD 수정본
}

/**
 * DB 행 → StyleDNA 매핑용 (snake_case → camelCase)
 */
export interface StyleDNARow {
  id: string;
  project_id: string;
  source_name: string;
  source_type: 'reference' | 'pd_feedback' | 'manual';
  prose_style: string | null;
  rhythm_pattern: string | null;
  dialogue_style: string | null;
  emotion_expression: string | null;
  scene_transition: string | null;
  action_description: string | null;
  best_samples: BestSample[];
  avoid_patterns: string[];
  favor_patterns: string[];
  confidence: number;
  weight: number;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * DB 행 → MergedStyleDNA 매핑용
 */
export interface MergedStyleDNARow {
  id: string;
  project_id: string;
  merged_prose_style: string | null;
  merged_rhythm_pattern: string | null;
  merged_dialogue_style: string | null;
  merged_emotion_expression: string | null;
  merged_scene_transition: string | null;
  merged_action_description: string | null;
  merged_best_samples: BestSample[];
  merged_avoid_patterns: string[];
  merged_favor_patterns: string[];
  source_count: number;
  reference_count: number;
  pd_feedback_count: number;
  average_confidence: number;
  version: number;
  last_merged_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * StyleDNA 목록 조회 응답
 */
export interface StyleDNAListResponse {
  dnas: StyleDNA[];
  stats: {
    total: number;
    active: number;
    referenceCount: number;
    pdFeedbackCount: number;
    manualCount: number;
  };
}

/**
 * 합성 DNA 조회 응답
 */
export interface MergedDNAResponse {
  mergedDNA: MergedStyleDNA | null;
  lastMergedAt: string | null;
}
