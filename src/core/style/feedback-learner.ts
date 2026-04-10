import { learnWritingDNAFromFeedback } from '@/core/style/writing-dna';

interface DiffSignals {
  originalParagraphs: number;
  editedParagraphs: number;
  originalAvgSentenceLength: number;
  editedAvgSentenceLength: number;
  originalShortRunCount: number;
  editedShortRunCount: number;
  originalDirectEmotionCount: number;
  editedDirectEmotionCount: number;
  changeRatio: number;
}

const DIRECT_EMOTION_PATTERN = /(분노|슬픔|두려움|공포|절망|기쁨|행복|짜증|불안|초조|놀람|당황|화가 나|무서웠|슬펐|기뻤)/g;

/**
 * PD가 AI 원고를 수정한 결과를 학습해서 Writing DNA로 누적한다.
 */
export async function learnFromFeedback(
  projectId: string,
  episodeNumber: number,
  originalText: string,
  editedText: string
): Promise<{ success: boolean; message: string }> {
  if (!originalText?.trim() || !editedText?.trim()) {
    return { success: false, message: '원본 또는 수정본 텍스트가 비어 있습니다.' };
  }

  if (originalText.trim() === editedText.trim()) {
    return { success: false, message: '원본과 수정본이 동일합니다.' };
  }

  const signals = analyzeDiffSignals(originalText, editedText);
  if (signals.changeRatio < 0.03) {
    return { success: false, message: '변경량이 작아 학습을 건너뜁니다.' };
  }

  const feedbackText = buildFeedbackRuleText(signals);

  try {
    await learnWritingDNAFromFeedback({
      projectId,
      feedbackText,
      feedbackType: 'pd_diff',
      preferenceSummary: `Episode ${episodeNumber} PD edit preference`,
      sourceName: `PD Feedback Episode ${episodeNumber}`,
    });

    return {
      success: true,
      message: `에피소드 ${episodeNumber} 수정 패턴을 Writing DNA로 반영했습니다.`,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : '피드백 학습 중 오류가 발생했습니다.',
    };
  }
}

/**
 * 채택 시 fire-and-forget으로 피드백 학습을 실행한다.
 */
export function triggerFeedbackLearning(
  projectId: string,
  episodeNumber: number,
  originalText: string | null,
  editedText: string
): void {
  if (!originalText?.trim()) {
    console.log('[FeedbackLearner] original_content is empty. Skip feedback learning.');
    return;
  }

  void learnFromFeedback(projectId, episodeNumber, originalText, editedText)
    .then((result) => {
      if (result.success) {
        console.log(`[FeedbackLearner] ${result.message}`);
      } else {
        console.log(`[FeedbackLearner] skipped: ${result.message}`);
      }
    })
    .catch((error) => {
      console.error('[FeedbackLearner] non-critical async failure:', error);
    });
}

export function hasSignificantChanges(
  originalText: string,
  editedText: string,
  threshold = 0.05
): boolean {
  if (!originalText || !editedText) return false;
  if (originalText.trim() === editedText.trim()) return false;
  return calculateChangeRatio(originalText, editedText) >= threshold;
}

function analyzeDiffSignals(originalText: string, editedText: string): DiffSignals {
  const originalParagraphs = splitParagraphs(originalText).length;
  const editedParagraphs = splitParagraphs(editedText).length;

  const originalSentences = splitSentences(originalText);
  const editedSentences = splitSentences(editedText);

  const originalAvgSentenceLength = averageLength(originalSentences);
  const editedAvgSentenceLength = averageLength(editedSentences);

  const originalShortRunCount = countConsecutiveShortSentenceRuns(originalSentences);
  const editedShortRunCount = countConsecutiveShortSentenceRuns(editedSentences);

  const originalDirectEmotionCount = countDirectEmotionWords(originalText);
  const editedDirectEmotionCount = countDirectEmotionWords(editedText);

  return {
    originalParagraphs,
    editedParagraphs,
    originalAvgSentenceLength,
    editedAvgSentenceLength,
    originalShortRunCount,
    editedShortRunCount,
    originalDirectEmotionCount,
    editedDirectEmotionCount,
    changeRatio: calculateChangeRatio(originalText, editedText),
  };
}

function buildFeedbackRuleText(signals: DiffSignals): string {
  const lines: string[] = [];

  lines.push('다음 규칙을 다음 회차 집필에 반영하라.');

  if (signals.editedShortRunCount < signals.originalShortRunCount) {
    lines.push('- 단문을 연속으로 나열하지 말고 연결 문장으로 묶어라.');
  }

  if (signals.editedAvgSentenceLength > signals.originalAvgSentenceLength * 1.08) {
    lines.push('- 의미가 이어지는 행동과 감각은 한 문장 또는 한 문단으로 자연스럽게 연결하라.');
  }

  if (signals.editedDirectEmotionCount < signals.originalDirectEmotionCount) {
    lines.push('- 감정을 직접 설명하지 말고 행동, 시선, 호흡, 촉각 반응으로 보여줘라.');
  }

  if (signals.editedParagraphs <= signals.originalParagraphs * 0.85) {
    lines.push('- 불필요한 줄바꿈을 줄이고 문단 호흡을 안정적으로 유지하라.');
  }

  if (lines.length === 1) {
    lines.push('- 문단 구조를 유지하면서 어색한 표현만 최소 수정하라.');
    lines.push('- 문장 리듬과 가독성을 우선하라.');
  }

  return lines.join('\n');
}

function calculateChangeRatio(original: string, edited: string): number {
  const normalizedOriginal = original.trim();
  const normalizedEdited = edited.trim();
  if (!normalizedOriginal.length) return normalizedEdited.length > 0 ? 1 : 0;

  const lengthDelta = Math.abs(normalizedOriginal.length - normalizedEdited.length) / normalizedOriginal.length;
  const paragraphDelta =
    Math.abs(splitParagraphs(normalizedOriginal).length - splitParagraphs(normalizedEdited).length) /
    Math.max(1, splitParagraphs(normalizedOriginal).length);
  const sentenceDelta =
    Math.abs(splitSentences(normalizedOriginal).length - splitSentences(normalizedEdited).length) /
    Math.max(1, splitSentences(normalizedOriginal).length);

  return (lengthDelta + paragraphDelta + sentenceDelta) / 3;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。！？])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function averageLength(items: string[]): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + item.length, 0);
  return total / items.length;
}

function countConsecutiveShortSentenceRuns(sentences: string[]): number {
  let runs = 0;
  let current = 0;

  for (const sentence of sentences) {
    const isShort = sentence.length <= 16;
    if (isShort) {
      current += 1;
      if (current === 2) {
        runs += 1;
      }
    } else {
      current = 0;
    }
  }

  return runs;
}

function countDirectEmotionWords(text: string): number {
  const matches = text.match(DIRECT_EMOTION_PATTERN);
  return matches ? matches.length : 0;
}
