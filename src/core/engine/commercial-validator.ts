import type { MergedStyleDNA } from '@/types/style-dna';

export interface ValidationResult {
  overallScore: number;
  passed: boolean;
  scores: {
    charCount: CharCountScore;
    cliffhanger: CliffhangerScore;
    showDontTell: ShowDontTellScore;
    dialogueRatio: DialogueRatioScore;
    sentenceRhythm: SentenceRhythmScore;
    forbiddenWords: ForbiddenWordsScore;
    writingDna: WritingDnaScore;
  };
  suggestions: string[];
  warnings: string[];
}

interface ValidatorOptions {
  writingDna?: MergedStyleDNA | null;
}

interface CharCountScore {
  score: number;
  charCount: number;
  target: { min: number; max: number };
  status: 'under' | 'good' | 'over';
}

interface CliffhangerScore {
  score: number;
  lastSentences: string[];
  detectedType: string | null;
  explanation: string;
}

interface ShowDontTellScore {
  score: number;
  violations: { text: string; suggestion: string }[];
  violationCount: number;
}

interface DialogueRatioScore {
  score: number;
  dialoguePercent: number;
  narrativePercent: number;
  isBalanced: boolean;
}

interface SentenceRhythmScore {
  score: number;
  avgSentenceLength: number;
  shortSentenceRatio: number;
  longSentenceRatio: number;
  hasGoodRhythm: boolean;
}

interface ForbiddenWordsScore {
  score: number;
  violations: { word: string; context: string }[];
  violationCount: number;
}

export interface WritingDnaViolation {
  rule: string;
  context: string;
  suggestion: string;
}

interface WritingDnaScore {
  score: number;
  activeRuleCount: number;
  violationCount: number;
  violations: WritingDnaViolation[];
}

const TELL_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /슬펐(?:다|다며|다면서)|슬퍼했다/g, suggestion: '표정, 목소리, 몸의 반응으로 슬픔을 보여주세요.' },
  { pattern: /화가 났(?:다|다며)|분노했(?:다|다며)/g, suggestion: '손끝, 시선, 호흡 변화로 분노를 드러내세요.' },
  { pattern: /기뻤(?:다|다며)|기뻐했(?:다|다며)/g, suggestion: '미소나 몸의 이완 같은 반응으로 기쁨을 표현하세요.' },
  { pattern: /긴장했(?:다|다며)|긴장감이 돌았다/g, suggestion: '목이 마르거나 숨이 가빠지는 신체 반응으로 바꿔보세요.' },
  { pattern: /두려웠(?:다|다며)|무서웠(?:다|다며)/g, suggestion: '심장 박동, 시야, 땀 같은 감각으로 공포를 표현하세요.' },
  { pattern: /불안했(?:다|다며)|초조했(?:다|다며)/g, suggestion: '손끝의 움직임이나 시선의 흔들림으로 바꿔보세요.' },
  { pattern: /당황했(?:다|다며)|놀랐(?:다|다며)/g, suggestion: '굳은 자세, 멈춘 호흡, 시선 변화로 표현하세요.' },
];

const FORBIDDEN_WORDS = [
  '팁',
  '오케이',
  '마스터',
  '레벨',
  '스킬',
  '버프',
  '디버프',
  '퀘스트',
  '미션',
  '랭크',
  '치트',
  '버그',
  '글리치',
  'OP',
  'GOD',
];

const CLIFFHANGER_PATTERNS = {
  crisis: /위기|경직|함정|사위|죽음|정체불명|막다른|최후/i,
  discovery: /발견|드러났|정체가|진실|비밀|깨어지|깨달/i,
  reversal: /반전|뒤집|예상과|믿을 수 없는|설마|아니었다/i,
  declaration: /선언|선포|맹세|약속|결의|다짐|각오/i,
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getContextSnippet(content: string, index: number, length: number) {
  const start = Math.max(0, index - 20);
  const end = Math.min(content.length, index + length + 20);
  return content.slice(start, end).trim();
}

function validateCharCount(content: string): CharCountScore {
  const charCount = content.length;
  const target = { min: 4000, max: 6000 };

  if (charCount < target.min) {
    return {
      score: clampScore((charCount / target.min) * 70),
      charCount,
      target,
      status: 'under',
    };
  }

  if (charCount > target.max) {
    return {
      score: clampScore(100 - Math.round((charCount - target.max) / 100) * 5),
      charCount,
      target,
      status: 'over',
    };
  }

  return {
    score: 100,
    charCount,
    target,
    status: 'good',
  };
}

function validateCliffhanger(content: string): CliffhangerScore {
  const lastPart = content.slice(-500);
  const sentences = lastPart
    .split(/[.!?]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 5);
  const lastSentences = sentences.slice(-3);
  const lastText = lastSentences.join(' ');

  let detectedType: string | null = null;
  let score = 50;

  if (CLIFFHANGER_PATTERNS.crisis.test(lastText)) {
    detectedType = 'crisis';
    score = 90;
  } else if (CLIFFHANGER_PATTERNS.discovery.test(lastText)) {
    detectedType = 'discovery';
    score = 85;
  } else if (CLIFFHANGER_PATTERNS.reversal.test(lastText)) {
    detectedType = 'reversal';
    score = 90;
  } else if (CLIFFHANGER_PATTERNS.declaration.test(lastText)) {
    detectedType = 'declaration';
    score = 80;
  }

  if (lastText.trim().endsWith('.') && !detectedType) {
    score -= 10;
  }

  const lastSentence = lastSentences[lastSentences.length - 1] || '';
  if (lastSentence.length < 30 && lastSentence.length > 5) {
    score += 10;
  }

  return {
    score: clampScore(score),
    lastSentences,
    detectedType,
    explanation: detectedType
      ? `${detectedType} type ending hook detected.`
      : 'No strong ending hook was detected.',
  };
}

function validateShowDontTell(content: string): ShowDontTellScore {
  const violations: { text: string; suggestion: string }[] = [];

  for (const { pattern, suggestion } of TELL_PATTERNS) {
    let match: RegExpExecArray | null = null;
    const regex = new RegExp(pattern);

    while ((match = regex.exec(content)) !== null) {
      violations.push({
        text: getContextSnippet(content, match.index, match[0].length),
        suggestion,
      });

      if (!regex.global) break;
    }
  }

  const uniqueViolations = violations.filter(
    (violation, index, array) => array.findIndex((item) => item.text === violation.text) === index
  );

  return {
    score: clampScore(100 - uniqueViolations.length * 10),
    violations: uniqueViolations.slice(0, 10),
    violationCount: uniqueViolations.length,
  };
}

function validateDialogueRatio(content: string): DialogueRatioScore {
  const dialogueMatches = content.match(/["“”][^"“”]+["“”]/g) || [];
  const dialogueLength = dialogueMatches.join('').length;
  const totalLength = Math.max(content.length, 1);
  const dialoguePercent = Math.round((dialogueLength / totalLength) * 100);
  const narrativePercent = 100 - dialoguePercent;
  const isBalanced = dialoguePercent >= 20 && dialoguePercent <= 50;

  let score = 100;

  if (!isBalanced) {
    if (dialoguePercent < 20) {
      score = 70 + dialoguePercent;
    } else {
      score = 100 - (dialoguePercent - 50);
    }
  }

  return {
    score: clampScore(score),
    dialoguePercent,
    narrativePercent,
    isBalanced,
  };
}

function validateSentenceRhythm(content: string): SentenceRhythmScore {
  const sentences = content
    .split(/[.!?]\s*|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);

  if (sentences.length === 0) {
    return {
      score: 50,
      avgSentenceLength: 0,
      shortSentenceRatio: 0,
      longSentenceRatio: 0,
      hasGoodRhythm: false,
    };
  }

  const lengths = sentences.map((sentence) => sentence.length);
  const avgSentenceLength = Math.round(lengths.reduce((sum, length) => sum + length, 0) / lengths.length);
  const shortSentences = lengths.filter((length) => length <= 15).length;
  const longSentences = lengths.filter((length) => length >= 40).length;
  const shortSentenceRatio = Math.round((shortSentences / sentences.length) * 100);
  const longSentenceRatio = Math.round((longSentences / sentences.length) * 100);
  const hasGoodRhythm =
    shortSentenceRatio >= 15 &&
    shortSentenceRatio <= 50 &&
    longSentenceRatio >= 5 &&
    longSentenceRatio <= 40;

  const varietyPenalty = Math.abs(shortSentenceRatio - 30) + Math.abs(longSentenceRatio - 20);

  return {
    score: hasGoodRhythm ? 100 : clampScore(100 - varietyPenalty),
    avgSentenceLength,
    shortSentenceRatio,
    longSentenceRatio,
    hasGoodRhythm,
  };
}

function validateForbiddenWords(content: string): ForbiddenWordsScore {
  const violations: { word: string; context: string }[] = [];

  for (const word of FORBIDDEN_WORDS) {
    const regex = new RegExp(word, 'gi');
    let match: RegExpExecArray | null = null;

    while ((match = regex.exec(content)) !== null) {
      violations.push({
        word,
        context: getContextSnippet(content, match.index, match[0].length),
      });
    }
  }

  return {
    score: clampScore(100 - violations.length * 20),
    violations: violations.slice(0, 10),
    violationCount: violations.length,
  };
}

function buildWritingDnaRegex(rule: string) {
  const escaped = rule
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');

  return new RegExp(escaped, 'i');
}

function findConsecutiveShortParagraphViolation(content: string) {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  let streak = 0;

  for (const paragraph of paragraphs) {
    const sentenceCount = paragraph
      .split(/[.!?]\s*|\n+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean).length;

    if (sentenceCount <= 1) {
      streak += 1;
      if (streak >= 2) return paragraph;
    } else {
      streak = 0;
    }
  }

  return null;
}

function validateWritingDna(content: string, writingDna?: MergedStyleDNA | null): WritingDnaScore {
  if (!writingDna) {
    return {
      score: 100,
      activeRuleCount: 0,
      violationCount: 0,
      violations: [],
    };
  }

  const violations: WritingDnaViolation[] = [];
  const activeRules = [
    ...(writingDna.avoidPatterns || []),
    ...(writingDna.favorPatterns || []),
    writingDna.proseStyle,
    writingDna.rhythmPattern,
    writingDna.dialogueStyle,
    writingDna.emotionExpression,
    writingDna.sceneTransition,
    writingDna.actionDescription,
  ].filter(Boolean).length;

  for (const rule of writingDna.avoidPatterns.slice(0, 10)) {
    const regex = buildWritingDnaRegex(rule);
    const match = regex.exec(content);
    if (match) {
      violations.push({
        rule,
        context: getContextSnippet(content, match.index, match[0].length),
        suggestion: `Writing DNA 금지 규칙 "${rule}"을 피하도록 문장을 다시 다듬어주세요.`,
      });
    }
  }

  if (
    /단문|스타카토|짧은 문장/i.test(
      [writingDna.rhythmPattern, ...writingDna.avoidPatterns, ...writingDna.favorPatterns].join(' ')
    )
  ) {
    const paragraph = findConsecutiveShortParagraphViolation(content);
    if (paragraph) {
      violations.push({
        rule: '단문 반복 금지',
        context: paragraph,
        suggestion: '짧은 문장을 연달아 끊지 말고 연결되는 행동과 감각을 한 문단으로 묶어주세요.',
      });
    }
  }

  if (
    /감정|show don't tell|직접 설명/i.test(
      [writingDna.emotionExpression, ...writingDna.avoidPatterns, ...writingDna.favorPatterns].join(' ')
    )
  ) {
    const tellScore = validateShowDontTell(content);
    for (const violation of tellScore.violations.slice(0, 3)) {
      violations.push({
        rule: '감정 직접 설명 금지',
        context: violation.text,
        suggestion: violation.suggestion,
      });
    }
  }

  const uniqueViolations = violations.filter(
    (violation, index, array) =>
      array.findIndex((item) => item.rule === violation.rule && item.context === violation.context) === index
  );

  return {
    score: clampScore(100 - uniqueViolations.length * 12),
    activeRuleCount: activeRules,
    violationCount: uniqueViolations.length,
    violations: uniqueViolations.slice(0, 8),
  };
}

export function validateEpisode(content: string, options: ValidatorOptions = {}): ValidationResult {
  const scores = {
    charCount: validateCharCount(content),
    cliffhanger: validateCliffhanger(content),
    showDontTell: validateShowDontTell(content),
    dialogueRatio: validateDialogueRatio(content),
    sentenceRhythm: validateSentenceRhythm(content),
    forbiddenWords: validateForbiddenWords(content),
    writingDna: validateWritingDna(content, options.writingDna),
  };

  const baseWeightedScore =
    scores.charCount.score * 0.18 +
    scores.cliffhanger.score * 0.22 +
    scores.showDontTell.score * 0.18 +
    scores.dialogueRatio.score * 0.1 +
    scores.sentenceRhythm.score * 0.1 +
    scores.forbiddenWords.score * 0.12 +
    scores.writingDna.score * 0.1;

  const overallScore = clampScore(baseWeightedScore);

  const hasCriticalIssue =
    scores.charCount.status === 'under' || scores.forbiddenWords.violationCount > 3;

  const passed = overallScore >= 70 && !hasCriticalIssue;

  const suggestions: string[] = [];
  const warnings: string[] = [];

  if (scores.charCount.status === 'under') {
    suggestions.push(
      `분량이 ${scores.charCount.charCount}자로 부족합니다. 최소 ${scores.charCount.target.min.toLocaleString()}자 이상으로 보강해주세요.`
    );
  } else if (scores.charCount.status === 'over') {
    warnings.push(`분량이 ${scores.charCount.charCount}자로 권장 상한을 넘었습니다.`);
  }

  if (scores.cliffhanger.score < 70) {
    suggestions.push('엔딩에 위기, 발견, 반전, 선언 중 하나를 더 선명하게 배치해주세요.');
  }

  for (const violation of scores.showDontTell.violations.slice(0, 3)) {
    suggestions.push(`"${violation.text}" → ${violation.suggestion}`);
  }

  if (!scores.dialogueRatio.isBalanced) {
    if (scores.dialogueRatio.dialoguePercent > 50) {
      suggestions.push('대사 비중이 높습니다. 행동과 서술을 보강해 호흡을 안정시켜주세요.');
    } else {
      suggestions.push('대사 비중이 낮습니다. 인물 반응과 짧은 대사를 보강해 장면의 생동감을 살려주세요.');
    }
  }

  if (!scores.sentenceRhythm.hasGoodRhythm) {
    suggestions.push('문장 길이 변주가 부족합니다. 짧은 문장과 긴 문장을 더 자연스럽게 섞어주세요.');
  }

  for (const violation of scores.forbiddenWords.violations) {
    warnings.push(`금기어 "${violation.word}" 발견: ${violation.context}`);
  }

  for (const violation of scores.writingDna.violations.slice(0, 4)) {
    suggestions.push(`[Writing DNA] ${violation.rule}: ${violation.suggestion}`);
  }

  return {
    overallScore,
    passed,
    scores,
    suggestions,
    warnings,
  };
}

export function quickValidate(content: string, options: ValidatorOptions = {}) {
  const charCount = content.length;
  const issues: string[] = [];

  if (charCount < 3500) {
    issues.push(`분량 부족 (${charCount}자 / 최소 4,000자 권장)`);
  }

  if (charCount > 7000) {
    issues.push(`분량 초과 (${charCount}자 / 최대 6,000자 권장)`);
  }

  const foundForbidden = FORBIDDEN_WORDS.filter((word) =>
    content.toLowerCase().includes(word.toLowerCase())
  );

  if (foundForbidden.length > 0) {
    issues.push(`금기어 발견: ${foundForbidden.join(', ')}`);
  }

  const writingDna = validateWritingDna(content, options.writingDna);
  if (writingDna.violationCount > 0) {
    issues.push(`Writing DNA 위반 ${writingDna.violationCount}건`);
  }

  return {
    charCount,
    passed: issues.length === 0,
    issues,
  };
}

export function validateFirstEpisode(
  content: string,
  options: ValidatorOptions = {}
): ValidationResult & {
  firstEpisodeChecks: {
    hasStrongOpening: boolean;
    hasProtagonistIntro: boolean;
    hasWorldHint: boolean;
    hasHook: boolean;
  };
} {
  const baseResult = validateEpisode(content, options);
  const first500 = content.slice(0, 500);
  const first1500 = content.slice(0, 1500);

  const firstEpisodeChecks = {
    hasStrongOpening: /차갑|피|비명|숨|낯선|깨|금속|발끝|눈을 떴/i.test(first500),
    hasProtagonistIntro: /그는|소년|사내|이름|손|몸을 일으켰/i.test(first500),
    hasWorldHint: /강호|무림|문파|관군|궁궐|전장|폐허|검|무공/i.test(first1500),
    hasHook: /비밀|정체|왜|무엇|그 순간|그때|낯선|이상한/i.test(content),
  };

  let bonus = 0;
  if (firstEpisodeChecks.hasStrongOpening) bonus += 3;
  if (firstEpisodeChecks.hasProtagonistIntro) bonus += 2;
  if (firstEpisodeChecks.hasWorldHint) bonus += 2;
  if (firstEpisodeChecks.hasHook) bonus += 3;

  if (!firstEpisodeChecks.hasStrongOpening) {
    baseResult.warnings.push('1화 초반의 감각적 훅이 약합니다. 첫 문장을 더 강하게 잡아주세요.');
  }

  if (!firstEpisodeChecks.hasProtagonistIntro) {
    baseResult.warnings.push('1화 초반에 주인공의 존재감이 충분히 드러나지 않습니다.');
  }

  if (!firstEpisodeChecks.hasHook) {
    baseResult.suggestions.push('1화 안에 다음 화를 궁금하게 만드는 미스터리나 떡밥을 더 선명하게 남겨주세요.');
  }

  return {
    ...baseResult,
    overallScore: clampScore(baseResult.overallScore + bonus),
    firstEpisodeChecks,
  };
}
