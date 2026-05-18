/**
 * Auto DNA Learner (Phase 4)
 *
 * PD가 AI 생성 본문을 수정할 때 자동으로 스타일 패턴을 학습
 * - 5-50% 변경 시에만 학습 (너무 적거나 많은 변경은 노이즈)
 * - AI로 diff 분석하여 패턴 추출
 * - writing_memories 또는 style_dna에 저장
 */

import { extractPatternsFromDiff } from '@/lib/ai/diff-analyzer';
import { saveStyleDNA, mergeDNAs } from './style-dna-manager';
import type { StyleAnalysisResult } from '@/types/style-dna';

interface LearnResult {
  learned: boolean;
  patternsCount: number;
  diffRatio: number;
  reason?: string;
}

/**
 * 두 문자열 간의 변경 비율 계산
 * 간단한 레벤슈타인 기반 근사치
 */
export function computeDiffRatio(original: string, edited: string): number {
  const originalLen = original.length;
  const editedLen = edited.length;

  if (originalLen === 0 && editedLen === 0) return 0;
  if (originalLen === 0) return 1;

  // 간단한 방식: 문자 집합 비교
  const originalWords = new Set(original.split(/\s+/).filter(Boolean));
  const editedWords = new Set(edited.split(/\s+/).filter(Boolean));

  let commonWords = 0;
  for (const word of originalWords) {
    if (editedWords.has(word)) commonWords++;
  }

  const totalUniqueWords = new Set([...originalWords, ...editedWords]).size;
  if (totalUniqueWords === 0) return 0;

  const similarity = commonWords / totalUniqueWords;
  return 1 - similarity;
}

/**
 * 의미 있는 diff 추출
 * - 50자 이상의 변경만 추출
 * - 연속된 변경 블록을 그룹화
 */
export function extractSemanticDiff(
  original: string,
  edited: string
): { removed: string[]; added: string[] } {
  const originalParagraphs = original.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const editedParagraphs = edited.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const removed: string[] = [];
  const added: string[] = [];

  // 원본에 있지만 수정본에 없는 문단 (50자 이상)
  for (const p of originalParagraphs) {
    const trimmed = p.trim();
    if (trimmed.length >= 50 && !editedParagraphs.some((ep) => ep.trim() === trimmed)) {
      removed.push(trimmed);
    }
  }

  // 수정본에 있지만 원본에 없는 문단 (50자 이상)
  for (const p of editedParagraphs) {
    const trimmed = p.trim();
    if (trimmed.length >= 50 && !originalParagraphs.some((op) => op.trim() === trimmed)) {
      added.push(trimmed);
    }
  }

  return { removed, added };
}

/**
 * 에피소드 수정으로부터 스타일 패턴 학습
 *
 * @param projectId - 프로젝트 ID
 * @param originalContent - AI가 생성한 원본 본문
 * @param editedContent - PD가 수정한 본문
 * @returns 학습 결과
 */
export async function learnFromEpisodeEdit(
  projectId: string,
  originalContent: string,
  editedContent: string
): Promise<LearnResult> {
  // 변경 비율 계산
  const diffRatio = computeDiffRatio(originalContent, editedContent);

  // 5-50% 변경 시에만 학습
  if (diffRatio < 0.05) {
    return {
      learned: false,
      patternsCount: 0,
      diffRatio,
      reason: '변경량이 너무 적음 (5% 미만)',
    };
  }

  if (diffRatio > 0.5) {
    return {
      learned: false,
      patternsCount: 0,
      diffRatio,
      reason: '변경량이 너무 많음 (50% 초과 - 전면 재작성)',
    };
  }

  // 의미 있는 diff 추출
  const diffs = extractSemanticDiff(originalContent, editedContent);

  if (diffs.removed.length === 0 && diffs.added.length === 0) {
    return {
      learned: false,
      patternsCount: 0,
      diffRatio,
      reason: '의미 있는 변경 블록 없음',
    };
  }

  // AI로 패턴 추출 (비용 효율을 위해 GPT-4o-mini 사용)
  let patterns: StyleAnalysisResult | null = null;
  try {
    patterns = await extractPatternsFromDiff(diffs);
  } catch (error) {
    console.warn('[AutoDNALearner] AI pattern extraction failed:', error);
    return {
      learned: false,
      patternsCount: 0,
      diffRatio,
      reason: 'AI 패턴 추출 실패',
    };
  }

  if (!patterns) {
    return {
      learned: false,
      patternsCount: 0,
      diffRatio,
      reason: '추출된 패턴 없음',
    };
  }

  // 패턴 저장
  const patternsCount =
    (patterns.avoidPatterns?.length || 0) +
    (patterns.favorPatterns?.length || 0) +
    (patterns.proseStyle ? 1 : 0) +
    (patterns.rhythmPattern ? 1 : 0) +
    (patterns.dialogueStyle ? 1 : 0);

  if (patternsCount === 0) {
    return {
      learned: false,
      patternsCount: 0,
      diffRatio,
      reason: '유효한 패턴 없음',
    };
  }

  // style_dna 테이블에 저장
  await saveStyleDNA(
    projectId,
    `Auto-learned ${new Date().toISOString().slice(0, 16)}`,
    'auto_learned',
    patterns
  );

  // DNA 재합성
  await mergeDNAs(projectId);

  return {
    learned: true,
    patternsCount,
    diffRatio,
  };
}
