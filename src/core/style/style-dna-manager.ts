// ============================================================================
// StyleDNA Manager - DNA CRUD 및 합성 로직
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type {
  StyleDNA,
  MergedStyleDNA,
  StyleAnalysisResult,
  StyleDNARow,
  MergedStyleDNARow,
  BestSample,
} from '@/types/style-dna';

// Service Role 클라이언트 생성
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ============================================================================
// StyleDNA CRUD
// ============================================================================

/**
 * 새 StyleDNA 저장
 */
export async function saveStyleDNA(
  projectId: string,
  sourceName: string,
  sourceType: 'reference' | 'pd_feedback' | 'manual',
  analysis: StyleAnalysisResult
): Promise<StyleDNA> {
  const supabase = getServiceClient();

  // PD 피드백은 가중치 2.0
  const weight = sourceType === 'pd_feedback' ? 2.0 : 1.0;

  const { data, error } = await supabase
    .from('style_dna')
    .insert({
      project_id: projectId,
      source_name: sourceName,
      source_type: sourceType,
      prose_style: analysis.proseStyle,
      rhythm_pattern: analysis.rhythmPattern,
      dialogue_style: analysis.dialogueStyle,
      emotion_expression: analysis.emotionExpression,
      scene_transition: analysis.sceneTransition,
      action_description: analysis.actionDescription,
      best_samples: analysis.bestSamples,
      avoid_patterns: analysis.avoidPatterns,
      favor_patterns: analysis.favorPatterns,
      confidence: analysis.confidence,
      weight,
    })
    .select()
    .single();

  if (error) {
    console.error('[StyleDNAManager] saveStyleDNA error:', error);
    throw error;
  }

  console.log(`[StyleDNAManager] StyleDNA 저장 완료: ${sourceName} (${sourceType})`);
  return mapRowToStyleDNA(data);
}

/**
 * 프로젝트의 모든 StyleDNA 조회
 */
export async function getStyleDNAs(
  projectId: string,
  activeOnly: boolean = false
): Promise<StyleDNA[]> {
  const supabase = getServiceClient();

  let query = supabase
    .from('style_dna')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[StyleDNAManager] getStyleDNAs error:', error);
    throw error;
  }

  return (data || []).map(mapRowToStyleDNA);
}

/**
 * 활성화된 StyleDNA만 조회 (합성용)
 */
export async function getActiveStyleDNAs(projectId: string): Promise<StyleDNA[]> {
  return getStyleDNAs(projectId, true);
}

/**
 * 단일 StyleDNA 조회
 */
export async function getStyleDNA(dnaId: string): Promise<StyleDNA | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('style_dna')
    .select('*')
    .eq('id', dnaId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return mapRowToStyleDNA(data);
}

/**
 * StyleDNA 업데이트
 */
export async function updateStyleDNA(
  dnaId: string,
  updates: Partial<{
    sourceName: string;
    proseStyle: string;
    rhythmPattern: string;
    dialogueStyle: string;
    emotionExpression: string;
    sceneTransition: string;
    actionDescription: string;
    bestSamples: BestSample[];
    avoidPatterns: string[];
    favorPatterns: string[];
    confidence: number;
    weight: number;
    isActive: boolean;
  }>
): Promise<StyleDNA> {
  const supabase = getServiceClient();

  // camelCase → snake_case 변환
  const dbUpdates: Record<string, unknown> = {};
  if (updates.sourceName !== undefined) dbUpdates.source_name = updates.sourceName;
  if (updates.proseStyle !== undefined) dbUpdates.prose_style = updates.proseStyle;
  if (updates.rhythmPattern !== undefined) dbUpdates.rhythm_pattern = updates.rhythmPattern;
  if (updates.dialogueStyle !== undefined) dbUpdates.dialogue_style = updates.dialogueStyle;
  if (updates.emotionExpression !== undefined) dbUpdates.emotion_expression = updates.emotionExpression;
  if (updates.sceneTransition !== undefined) dbUpdates.scene_transition = updates.sceneTransition;
  if (updates.actionDescription !== undefined) dbUpdates.action_description = updates.actionDescription;
  if (updates.bestSamples !== undefined) dbUpdates.best_samples = updates.bestSamples;
  if (updates.avoidPatterns !== undefined) dbUpdates.avoid_patterns = updates.avoidPatterns;
  if (updates.favorPatterns !== undefined) dbUpdates.favor_patterns = updates.favorPatterns;
  if (updates.confidence !== undefined) dbUpdates.confidence = updates.confidence;
  if (updates.weight !== undefined) dbUpdates.weight = updates.weight;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('style_dna')
    .update(dbUpdates)
    .eq('id', dnaId)
    .select()
    .single();

  if (error) throw error;
  return mapRowToStyleDNA(data);
}

/**
 * StyleDNA 삭제
 */
export async function deleteStyleDNA(dnaId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from('style_dna')
    .delete()
    .eq('id', dnaId);

  if (error) throw error;
}

// ============================================================================
// 합성 DNA 관리
// ============================================================================

/**
 * 프로젝트의 활성 DNA들을 합성하여 MergedStyleDNA 생성/갱신
 */
export async function mergeDNAs(projectId: string): Promise<MergedStyleDNA> {
  const supabase = getServiceClient();

  const dnas = await getActiveStyleDNAs(projectId);

  if (dnas.length === 0) {
    console.log('[StyleDNAManager] 활성 DNA 없음, 합성 스킵');
    throw new Error('합성할 활성 StyleDNA가 없습니다.');
  }

  console.log(`[StyleDNAManager] ${dnas.length}개 DNA 합성 시작`);

  // 가중 평균으로 합성
  const merged = weightedMerge(dnas);

  const { data, error } = await supabase
    .from('style_dna_merged')
    .upsert(
      {
        project_id: projectId,
        merged_prose_style: merged.proseStyle,
        merged_rhythm_pattern: merged.rhythmPattern,
        merged_dialogue_style: merged.dialogueStyle,
        merged_emotion_expression: merged.emotionExpression,
        merged_scene_transition: merged.sceneTransition,
        merged_action_description: merged.actionDescription,
        merged_best_samples: merged.bestSamples,
        merged_avoid_patterns: merged.avoidPatterns,
        merged_favor_patterns: merged.favorPatterns,
        source_count: dnas.length,
        reference_count: dnas.filter(d => d.sourceType === 'reference').length,
        pd_feedback_count: dnas.filter(d => d.sourceType === 'pd_feedback').length,
        average_confidence: merged.averageConfidence,
        last_merged_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    .select()
    .single();

  if (error) {
    console.error('[StyleDNAManager] mergeDNAs error:', error);
    throw error;
  }

  console.log(`[StyleDNAManager] DNA 합성 완료: ${dnas.length}개 소스`);
  return mapRowToMergedDNA(data);
}

/**
 * 합성된 MergedStyleDNA 조회
 */
export async function getMergedDNA(projectId: string): Promise<MergedStyleDNA | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('style_dna_merged')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return mapRowToMergedDNA(data);
}

// ============================================================================
// 합성 로직
// ============================================================================

interface MergeResult {
  proseStyle: string | null;
  rhythmPattern: string | null;
  dialogueStyle: string | null;
  emotionExpression: string | null;
  sceneTransition: string | null;
  actionDescription: string | null;
  bestSamples: BestSample[];
  avoidPatterns: string[];
  favorPatterns: string[];
  averageConfidence: number;
}

/**
 * 가중 평균 합성 로직
 * - PD 피드백 DNA는 weight가 2.0이므로 더 큰 영향
 * - 텍스트 필드는 가장 높은 weighted confidence를 가진 DNA에서 채택
 */
function weightedMerge(dnas: StyleDNA[]): MergeResult {
  // weighted confidence = confidence * weight
  const sortedDNAs = [...dnas].sort(
    (a, b) => (b.confidence * b.weight) - (a.confidence * a.weight)
  );

  const primary = sortedDNAs[0];

  // 텍스트 필드 합성: 가장 높은 가중치 DNA를 기준으로
  // 보조 DNA들의 내용을 참고하여 보완할 수도 있지만, 단순화를 위해 primary 사용
  let mergedProseStyle = primary.proseStyle;
  let mergedRhythmPattern = primary.rhythmPattern;
  let mergedDialogueStyle = primary.dialogueStyle;
  let mergedEmotionExpression = primary.emotionExpression;
  let mergedSceneTransition = primary.sceneTransition;
  let mergedActionDescription = primary.actionDescription;

  // PD 피드백이 있으면 해당 필드를 우선 사용
  const pdFeedbacks = dnas.filter(d => d.sourceType === 'pd_feedback');
  if (pdFeedbacks.length > 0) {
    const latestPD = pdFeedbacks[0]; // 가장 최근 PD 피드백
    if (latestPD.proseStyle) mergedProseStyle = latestPD.proseStyle;
    if (latestPD.rhythmPattern) mergedRhythmPattern = latestPD.rhythmPattern;
    if (latestPD.dialogueStyle) mergedDialogueStyle = latestPD.dialogueStyle;
    if (latestPD.emotionExpression) mergedEmotionExpression = latestPD.emotionExpression;
    if (latestPD.sceneTransition) mergedSceneTransition = latestPD.sceneTransition;
    if (latestPD.actionDescription) mergedActionDescription = latestPD.actionDescription;
  }

  // bestSamples: 모든 DNA에서 수집하되 중복 제거, 최대 5개
  const allBestSamples = dnas.flatMap(d => d.bestSamples);
  const uniqueBestSamples = allBestSamples.reduce((acc, sample) => {
    const isDup = acc.some(s => s.goodExample === sample.goodExample);
    if (!isDup) acc.push(sample);
    return acc;
  }, [] as BestSample[]).slice(0, 5);

  // 패턴: 합집합 (중복 제거)
  const mergedAvoidPatterns = [...new Set(dnas.flatMap(d => d.avoidPatterns))].slice(0, 15);
  const mergedFavorPatterns = [...new Set(dnas.flatMap(d => d.favorPatterns))].slice(0, 15);

  // 평균 confidence (가중 평균)
  const totalWeight = dnas.reduce((sum, d) => sum + d.weight, 0);
  const weightedConfidenceSum = dnas.reduce((sum, d) => sum + d.confidence * d.weight, 0);
  const averageConfidence = weightedConfidenceSum / totalWeight;

  return {
    proseStyle: mergedProseStyle,
    rhythmPattern: mergedRhythmPattern,
    dialogueStyle: mergedDialogueStyle,
    emotionExpression: mergedEmotionExpression,
    sceneTransition: mergedSceneTransition,
    actionDescription: mergedActionDescription,
    bestSamples: uniqueBestSamples,
    avoidPatterns: mergedAvoidPatterns,
    favorPatterns: mergedFavorPatterns,
    averageConfidence,
  };
}

// ============================================================================
// 매핑 함수
// ============================================================================

function mapRowToStyleDNA(row: StyleDNARow): StyleDNA {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceName: row.source_name,
    sourceType: row.source_type,
    proseStyle: row.prose_style,
    rhythmPattern: row.rhythm_pattern,
    dialogueStyle: row.dialogue_style,
    emotionExpression: row.emotion_expression,
    sceneTransition: row.scene_transition,
    actionDescription: row.action_description,
    bestSamples: row.best_samples || [],
    avoidPatterns: row.avoid_patterns || [],
    favorPatterns: row.favor_patterns || [],
    confidence: row.confidence,
    weight: row.weight,
    version: row.version,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToMergedDNA(row: MergedStyleDNARow): MergedStyleDNA {
  return {
    id: row.id,
    projectId: row.project_id,
    proseStyle: row.merged_prose_style,
    rhythmPattern: row.merged_rhythm_pattern,
    dialogueStyle: row.merged_dialogue_style,
    emotionExpression: row.merged_emotion_expression,
    sceneTransition: row.merged_scene_transition,
    actionDescription: row.merged_action_description,
    bestSamples: row.merged_best_samples || [],
    avoidPatterns: row.merged_avoid_patterns || [],
    favorPatterns: row.merged_favor_patterns || [],
    sourceCount: row.source_count,
    referenceCount: row.reference_count,
    pdFeedbackCount: row.pd_feedback_count,
    averageConfidence: row.average_confidence,
    version: row.version,
    lastMergedAt: row.last_merged_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 외부 export
export { mapRowToStyleDNA, mapRowToMergedDNA };
