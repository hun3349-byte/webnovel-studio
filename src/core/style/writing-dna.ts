import type { MergedStyleDNA, StyleAnalysisResult } from '@/types/style-dna';
import { getMergedDNA, mergeDNAs, saveStyleDNA } from './style-dna-manager';

export interface WritingDNAFeedbackInput {
  projectId: string;
  feedbackText?: string | null;
  feedbackType?: string | null;
  preferenceSummary?: string | null;
  avoidPatterns?: string[] | null;
  favorPatterns?: string[] | null;
  sourceName?: string | null;
}

const FEEDBACK_RULE_LIBRARY: Array<{
  match: RegExp;
  proseStyle?: string;
  rhythmPattern?: string;
  dialogueStyle?: string;
  emotionExpression?: string;
  sceneTransition?: string;
  actionDescription?: string;
  avoidPatterns?: string[];
  favorPatterns?: string[];
}> = [
  {
    match: /(단문|스타카토|짧은 문장|문장을 쪼개)/i,
    rhythmPattern:
      '짧은 단문을 연속으로 나열하지 말고, 연결되는 행동과 감각은 한 문장 또는 한 문단으로 묶어 자연스럽게 이어간다.',
    avoidPatterns: ['단문 반복', '스타카토식 문장 나열', '한 줄짜리 문단 반복'],
    favorPatterns: ['2~4문장 중심의 문단 호흡', '연결되는 행동과 감각을 한 문장으로 묶기'],
  },
  {
    match: /(감정 직접|직접 설명|show don't tell|보여줘)/i,
    emotionExpression:
      '감정은 이름을 붙여 설명하지 말고, 신체 반응과 행동, 시선, 호흡 변화로 보여준다.',
    avoidPatterns: ['감정 직접 설명', '감정 이름을 바로 서술'],
    favorPatterns: ['신체 반응으로 감정 표현', '행동과 감각으로 감정 암시'],
  },
  {
    match: /(문단|줄바꿈|호흡|리듬)/i,
    proseStyle:
      '문단은 과하게 쪼개지 말고, 같은 행동 흐름과 시선을 한 덩어리로 유지해 읽는 호흡을 안정시킨다.',
    sceneTransition: '장면 전환은 급격한 끊김보다 시선과 행동이 이어지는 흐름으로 처리한다.',
    avoidPatterns: ['불필요한 줄바꿈', '한 문장 문단 남발'],
    favorPatterns: ['2~4문장 문단 유지', '장면 전환을 자연스럽게 연결'],
  },
  {
    match: /(대사|말투|설명충|핑퐁)/i,
    dialogueStyle:
      '대사는 설명을 대신하지 말고, 인물의 성격과 상황 반응이 드러나도록 짧고 자연스럽게 쓴다.',
    avoidPatterns: ['설명용 대사', '핑퐁식 대사 나열'],
    favorPatterns: ['행동과 붙은 대사', '캐릭터 성격이 보이는 말투'],
  },
  {
    match: /(묘사|감각|장면|배경)/i,
    proseStyle:
      '감각과 배경 묘사는 짧게 흩뿌리지 말고, 장면 단위로 묶어서 머릿속에 그려지게 전달한다.',
    avoidPatterns: ['같은 감각 반복', '배경 묘사 파편화'],
    favorPatterns: ['장면 단위 묘사', '감각을 묶어 전달'],
  },
];

function dedupe(items: Array<string | null | undefined>): string[] {
  return [...new Set(items.map((item) => item?.trim()).filter(Boolean) as string[])];
}

function classifyFeedbackType(input: string, explicitType?: string | null): string {
  if (explicitType?.trim()) return explicitType.trim();
  if (/(대사|말투)/i.test(input)) return 'dialogue';
  if (/(호흡|리듬|단문|스타카토)/i.test(input)) return 'pacing';
  if (/(묘사|감각|배경|장면)/i.test(input)) return 'description';
  if (/(구성|구조|문단|전개)/i.test(input)) return 'structure';
  return 'style';
}

function extractBulletRules(feedbackText: string): { avoid: string[]; favor: string[] } {
  const lines = feedbackText
    .split(/\r?\n|[.;]/)
    .map((line) => line.trim())
    .filter(Boolean);

  const avoid: string[] = [];
  const favor: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/^[-*]\s*/, '');

    if (/(금지|하지 마|하지마|반복 금지|쓰지 마|쓰지마|피해)/i.test(normalized)) {
      avoid.push(normalized);
      continue;
    }

    if (/(유지|권장|선호|좋다|좋아|강화|살려|써라|써라)/i.test(normalized)) {
      favor.push(normalized);
    }
  }

  return { avoid: dedupe(avoid), favor: dedupe(favor) };
}

export function convertFeedbackToWritingDNA(
  input: WritingDNAFeedbackInput
): StyleAnalysisResult {
  const feedbackText = input.feedbackText?.trim() || '';
  const feedbackSummary =
    input.preferenceSummary?.trim() ||
    feedbackText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(' ') ||
    '사용자 피드백 기반 문체 규칙';

  const inferredType = classifyFeedbackType(feedbackText, input.feedbackType);
  const bulletRules = extractBulletRules(feedbackText);
  const matchedRules = FEEDBACK_RULE_LIBRARY.filter((rule) => rule.match.test(feedbackText));

  const proseStyle = dedupe([
    input.preferenceSummary,
    ...matchedRules.map((rule) => rule.proseStyle),
  ]).join(' ');

  const rhythmPattern = dedupe(matchedRules.map((rule) => rule.rhythmPattern)).join(' ');
  const dialogueStyle = dedupe(matchedRules.map((rule) => rule.dialogueStyle)).join(' ');
  const emotionExpression = dedupe(matchedRules.map((rule) => rule.emotionExpression)).join(' ');
  const sceneTransition = dedupe(matchedRules.map((rule) => rule.sceneTransition)).join(' ');
  const actionDescription = dedupe(matchedRules.map((rule) => rule.actionDescription)).join(' ');

  const avoidPatterns = dedupe([
    ...(input.avoidPatterns || []),
    ...bulletRules.avoid,
    ...matchedRules.flatMap((rule) => rule.avoidPatterns || []),
  ]);

  const favorPatterns = dedupe([
    ...(input.favorPatterns || []),
    ...bulletRules.favor,
    ...matchedRules.flatMap((rule) => rule.favorPatterns || []),
  ]);

  const typedSummary =
    inferredType === 'dialogue'
      ? `대사 규칙: ${feedbackSummary}`
      : inferredType === 'pacing'
      ? `호흡 규칙: ${feedbackSummary}`
      : inferredType === 'description'
      ? `묘사 규칙: ${feedbackSummary}`
      : inferredType === 'structure'
      ? `구조 규칙: ${feedbackSummary}`
      : feedbackSummary;

  return {
    proseStyle: proseStyle || typedSummary,
    rhythmPattern: rhythmPattern || null,
    dialogueStyle: dialogueStyle || null,
    emotionExpression: emotionExpression || null,
    sceneTransition: sceneTransition || null,
    actionDescription: actionDescription || null,
    avoidPatterns,
    favorPatterns,
    bestSamples: [],
    confidence:
      matchedRules.length > 0 || avoidPatterns.length > 0 || favorPatterns.length > 0 ? 0.82 : 0.65,
  };
}

export async function learnWritingDNAFromFeedback(
  input: WritingDNAFeedbackInput
): Promise<{ mergedDNA: MergedStyleDNA | null }> {
  const analysis = convertFeedbackToWritingDNA(input);

  if (
    !analysis.proseStyle &&
    !analysis.rhythmPattern &&
    !analysis.dialogueStyle &&
    !analysis.emotionExpression &&
    !analysis.sceneTransition &&
    !analysis.actionDescription &&
    analysis.avoidPatterns.length === 0 &&
    analysis.favorPatterns.length === 0
  ) {
    return { mergedDNA: await getMergedDNA(input.projectId) };
  }

  await saveStyleDNA(
    input.projectId,
    input.sourceName || `Writing DNA Feedback ${new Date().toISOString().slice(0, 10)}`,
    'pd_feedback',
    analysis
  );

  const mergedDNA = await mergeDNAs(input.projectId);
  return { mergedDNA };
}

export async function getWritingDNA(projectId: string): Promise<MergedStyleDNA | null> {
  return getMergedDNA(projectId);
}

export function formatWritingDnaPrompt(dna: MergedStyleDNA | null): string {
  if (!dna) return '';

  const sections: string[] = ['<writing_dna>'];

  if (dna.proseStyle) {
    sections.push(`Core prose rule: ${dna.proseStyle}`);
  }

  if (dna.rhythmPattern) {
    sections.push(`Rhythm: ${dna.rhythmPattern}`);
  }

  if (dna.dialogueStyle) {
    sections.push(`Dialogue: ${dna.dialogueStyle}`);
  }

  if (dna.emotionExpression) {
    sections.push(`Emotion: ${dna.emotionExpression}`);
  }

  if (dna.sceneTransition) {
    sections.push(`Transition: ${dna.sceneTransition}`);
  }

  if (dna.actionDescription) {
    sections.push(`Action: ${dna.actionDescription}`);
  }

  if (dna.avoidPatterns.length > 0) {
    sections.push(`Avoid: ${dna.avoidPatterns.slice(0, 8).join(' / ')}`);
  }

  if (dna.favorPatterns.length > 0) {
    sections.push(`Favor: ${dna.favorPatterns.slice(0, 8).join(' / ')}`);
  }

  sections.push('</writing_dna>');
  return sections.join('\n');
}
