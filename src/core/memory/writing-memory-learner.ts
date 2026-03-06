import { createServiceRoleClient } from '@/lib/supabase/server';
import type { WritingPreference } from '@/types/memory';

/**
 * Writing Memory Learner
 *
 * PD의 문체 선호도를 학습하고 프롬프트에 주입할 데이터를 준비합니다.
 * 자가진화 피드백 루프의 핵심 컴포넌트입니다.
 *
 * 규칙:
 * - PD의 수정 패턴은 기본 상업 웹소설 규칙보다 우선 적용됩니다.
 * - 신뢰도가 높은 패턴이 우선순위를 가집니다.
 * - 활성화된 패턴만 프롬프트에 포함됩니다.
 */

export interface WritingMemoryContext {
  preferences: WritingPreference[];
  summaryForPrompt: string;
  avoidPatternsForPrompt: string[];
  favorPatternsForPrompt: string[];
}

/**
 * 프로젝트의 활성화된 Writing Memory를 조회하고 프롬프트용으로 포맷합니다.
 */
export async function getWritingMemoryContext(
  projectId: string,
  limit: number = 10
): Promise<WritingMemoryContext> {
  const supabase = createServiceRoleClient();

  const { data: memories, error } = await supabase
    .from('writing_memories')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('confidence', { ascending: false })
    .order('applied_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Writing memory fetch error:', error);
    return {
      preferences: [],
      summaryForPrompt: '',
      avoidPatternsForPrompt: [],
      favorPatternsForPrompt: [],
    };
  }

  if (!memories || memories.length === 0) {
    return {
      preferences: [],
      summaryForPrompt: '',
      avoidPatternsForPrompt: [],
      favorPatternsForPrompt: [],
    };
  }

  // WritingPreference 형식으로 변환
  const preferences: WritingPreference[] = memories
    .filter(mem => mem.feedback_type) // null인 경우 제외
    .map(mem => ({
      feedbackType: mem.feedback_type!,
      preferenceSummary: mem.preference_summary || '',
      avoidPatterns: mem.avoid_patterns || [],
      favorPatterns: mem.favor_patterns || [],
      confidence: mem.confidence || 0.5,
    }));

  // 모든 패턴 수집 (중복 제거)
  const allAvoidPatterns = new Set<string>();
  const allFavorPatterns = new Set<string>();

  memories.forEach(mem => {
    (mem.avoid_patterns || []).forEach((p: string) => allAvoidPatterns.add(p));
    (mem.favor_patterns || []).forEach((p: string) => allFavorPatterns.add(p));
  });

  // 요약 생성
  const summaries = memories
    .filter(m => m.preference_summary)
    .map(m => `- ${m.preference_summary}`)
    .slice(0, 5);

  const summaryForPrompt = summaries.length > 0
    ? `PD 문체 선호도 (최우선 적용):\n${summaries.join('\n')}`
    : '';

  return {
    preferences,
    summaryForPrompt,
    avoidPatternsForPrompt: Array.from(allAvoidPatterns),
    favorPatternsForPrompt: Array.from(allFavorPatterns),
  };
}

/**
 * 프롬프트 주입용 Writing Memory 섹션을 생성합니다.
 * 이 섹션은 상업 웹소설 기본 규칙보다 우선 적용됩니다.
 */
export function formatWritingMemoryForPrompt(context: WritingMemoryContext): string {
  if (context.preferences.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // 최우선 규칙 헤더
  sections.push(`## 🔥 PD 문체 선호도 (최우선 적용 - 기본 규칙보다 우선)

다음은 PD가 이전 에피소드에서 직접 수정하며 표현한 문체 선호도입니다.
이 패턴들은 상업 웹소설 기본 규칙보다 우선 적용해야 합니다.`);

  // 요약
  if (context.summaryForPrompt) {
    sections.push(context.summaryForPrompt);
  }

  // 피해야 할 패턴
  if (context.avoidPatternsForPrompt.length > 0) {
    sections.push(`### ❌ 절대 사용 금지 패턴
${context.avoidPatternsForPrompt.map(p => `- ${p}`).join('\n')}`);
  }

  // 선호하는 패턴
  if (context.favorPatternsForPrompt.length > 0) {
    sections.push(`### ✅ 적극 사용 패턴
${context.favorPatternsForPrompt.map(p => `- ${p}`).join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Writing Memory 적용 카운트를 증가시킵니다.
 * 에피소드 생성 후 호출됩니다.
 */
export async function incrementAppliedCount(
  projectId: string,
  memoryIds: string[]
): Promise<void> {
  if (memoryIds.length === 0) return;

  const supabase = createServiceRoleClient();

  // 각 메모리의 적용 카운트 증가 (raw SQL 사용)
  for (const id of memoryIds) {
    // applied_count를 1 증가시키는 업데이트
    const { data: currentData } = await supabase
      .from('writing_memories')
      .select('applied_count')
      .eq('id', id)
      .eq('project_id', projectId)
      .single();

    if (currentData) {
      await supabase
        .from('writing_memories')
        .update({
          applied_count: (currentData.applied_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('project_id', projectId);
    }
  }
}

/**
 * 텍스트 수정에서 패턴을 자동으로 감지합니다.
 * (간단한 휴리스틱 기반 - AI 분석 전 사전 필터링용)
 */
export function detectEditPatterns(
  original: string,
  edited: string
): { hasSignificantChanges: boolean; changeRatio: number } {
  const originalLength = original.length;
  const editedLength = edited.length;

  // 길이 변화 비율
  const lengthDiff = Math.abs(originalLength - editedLength);
  const changeRatio = lengthDiff / Math.max(originalLength, 1);

  // 단어 수 비교
  const originalWords = original.split(/\s+/).length;
  const editedWords = edited.split(/\s+/).length;
  const wordDiff = Math.abs(originalWords - editedWords);

  // 유의미한 변경인지 판단 (최소 10% 변경 또는 10단어 이상 변경)
  const hasSignificantChanges = changeRatio > 0.1 || wordDiff > 10;

  return {
    hasSignificantChanges,
    changeRatio,
  };
}
