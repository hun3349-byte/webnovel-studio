// ============================================================================
// Feedback Learner - PD 피드백 자동 학습
// ============================================================================

import { analyzeStyleFromFeedback } from './style-analyzer';
import { saveStyleDNA, mergeDNAs } from './style-dna-manager';

// ============================================================================
// 피드백 학습
// ============================================================================

/**
 * PD 피드백에서 StyleDNA 학습
 * 에피소드 채택 시 원본/수정본 비교하여 호출
 */
export async function learnFromFeedback(
  projectId: string,
  episodeNumber: number,
  originalText: string,
  editedText: string
): Promise<{ success: boolean; message: string }> {
  console.log(`[FeedbackLearner] 에피소드 ${episodeNumber} 피드백 학습 시작`);

  // 1. 텍스트 검증
  if (!originalText || !editedText) {
    console.log('[FeedbackLearner] 텍스트 누락, 학습 스킵');
    return { success: false, message: '원본 또는 수정본 텍스트가 없습니다.' };
  }

  // 2. 변경 비율 체크
  const changeRatio = calculateChangeRatio(originalText, editedText);
  console.log(`[FeedbackLearner] 변경 비율: ${(changeRatio * 100).toFixed(1)}%`);

  if (changeRatio < 0.05) {
    console.log('[FeedbackLearner] 변경이 5% 미만, 학습 스킵');
    return { success: false, message: '변경이 5% 미만으로 유의미한 차이가 없습니다.' };
  }

  // 3. 텍스트가 동일한지 체크
  if (originalText.trim() === editedText.trim()) {
    console.log('[FeedbackLearner] 텍스트 동일, 학습 스킵');
    return { success: false, message: '원본과 수정본이 동일합니다.' };
  }

  try {
    // 4. AI로 피드백 분석
    console.log('[FeedbackLearner] AI 피드백 분석 시작...');
    const analysis = await analyzeStyleFromFeedback(originalText, editedText);

    // 5. StyleDNA로 저장
    const sourceName = `PD_피드백_${episodeNumber}화`;
    const styleDNA = await saveStyleDNA(
      projectId,
      sourceName,
      'pd_feedback',
      analysis
    );

    console.log(`[FeedbackLearner] StyleDNA 저장 완료: ${styleDNA.id}`);

    // 6. 합성 DNA 재생성
    console.log('[FeedbackLearner] 합성 DNA 재생성...');
    await mergeDNAs(projectId);

    console.log(`[FeedbackLearner] 에피소드 ${episodeNumber} 학습 완료`);
    return {
      success: true,
      message: `에피소드 ${episodeNumber}의 PD 피드백을 학습했습니다.`,
    };
  } catch (error) {
    console.error('[FeedbackLearner] 학습 실패:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : '피드백 학습 중 오류가 발생했습니다.',
    };
  }
}

/**
 * 에피소드 채택 시 자동으로 피드백 학습 트리거
 * (비동기로 실행, 채택 프로세스를 블로킹하지 않음)
 */
export function triggerFeedbackLearning(
  projectId: string,
  episodeNumber: number,
  originalText: string | null,
  editedText: string
): void {
  if (!originalText) {
    console.log('[FeedbackLearner] original_content 없음, 자동 학습 스킵');
    return;
  }

  // 비동기로 학습 실행 (fire-and-forget)
  learnFromFeedback(projectId, episodeNumber, originalText, editedText)
    .then(result => {
      if (result.success) {
        console.log(`[FeedbackLearner] 자동 학습 성공: ${result.message}`);
      } else {
        console.log(`[FeedbackLearner] 자동 학습 스킵: ${result.message}`);
      }
    })
    .catch(error => {
      console.error('[FeedbackLearner] 자동 학습 실패 (non-critical):', error);
    });
}

// ============================================================================
// 유틸리티
// ============================================================================

/**
 * 텍스트 변경 비율 계산
 */
function calculateChangeRatio(original: string, edited: string): number {
  const originalLen = original.length;
  const editedLen = edited.length;

  if (originalLen === 0) return editedLen > 0 ? 1 : 0;

  // Levenshtein 거리 기반 계산은 비용이 높으므로
  // 간단하게 길이 변화 + 단어 변화로 추정
  const lengthChange = Math.abs(originalLen - editedLen) / originalLen;

  // 단어 수 변화
  const originalWords = original.split(/\s+/).length;
  const editedWords = edited.split(/\s+/).length;
  const wordChange = Math.abs(originalWords - editedWords) / originalWords;

  // 두 지표의 평균
  return (lengthChange + wordChange) / 2;
}

/**
 * 변경이 유의미한지 판단
 */
export function hasSignificantChanges(
  originalText: string,
  editedText: string,
  threshold: number = 0.05
): boolean {
  if (!originalText || !editedText) return false;
  if (originalText.trim() === editedText.trim()) return false;

  const ratio = calculateChangeRatio(originalText, editedText);
  return ratio >= threshold;
}
