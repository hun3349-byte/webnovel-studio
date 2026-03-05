/**
 * 상업 웹소설 퀄리티 검증기
 *
 * 생성된 에피소드의 상업적 품질을 자동으로 평가합니다.
 *
 * 검증 항목:
 * 1. 분량 (4,000~6,000자)
 * 2. 절단신공 (클리프행어)
 * 3. Show Don't Tell (감정 직접 서술 금지)
 * 4. 대사 비율 (70/30 법칙)
 * 5. 문장 리듬 (단짠단짠)
 * 6. 금기어 검출
 */

export interface ValidationResult {
  // 전체 점수 (0~100)
  overallScore: number;

  // 통과 여부
  passed: boolean;

  // 상세 점수
  scores: {
    charCount: CharCountScore;
    cliffhanger: CliffhangerScore;
    showDontTell: ShowDontTellScore;
    dialogueRatio: DialogueRatioScore;
    sentenceRhythm: SentenceRhythmScore;
    forbiddenWords: ForbiddenWordsScore;
  };

  // 개선 제안
  suggestions: string[];

  // 경고
  warnings: string[];
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

// 감정 직접 서술 패턴 (Show Don't Tell 위반)
const TELL_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
  { pattern: /슬펐다|슬퍼[했졌]|슬픔[이을]/g, suggestion: '눈물, 떨리는 목소리, 굳은 표정으로 표현' },
  { pattern: /화[가났]|분노[했를]/g, suggestion: '이를 악물다, 주먹을 쥐다, 목소리가 높아지다로 표현' },
  { pattern: /기뻤다|기쁨[을이]/g, suggestion: '미소, 들뜬 목소리, 가벼운 발걸음으로 표현' },
  { pattern: /긴장[했되]/g, suggestion: '심장이 뛰다, 손에 땀, 숨을 멈추다로 표현' },
  { pattern: /두려[웠움]/g, suggestion: '떨리는 손, 식은땀, 뒷걸음질로 표현' },
  { pattern: /행복[했해]/g, suggestion: '얼굴이 밝아지다, 콧노래, 입꼬리가 올라가다로 표현' },
  { pattern: /불안[했해]/g, suggestion: '손을 비비다, 눈동자가 흔들리다, 안절부절로 표현' },
  { pattern: /당황[했스]/g, suggestion: '굳은 표정, 말을 더듬다, 시선을 피하다로 표현' },
  { pattern: /놀랐|놀라[서움]/g, suggestion: '눈이 커지다, 숨이 멎다, 입이 벌어지다로 표현' },
  { pattern: /무서[웠워]/g, suggestion: '오싹함, 소름, 심장이 쿵쾅으로 표현' },
];

// 현대 외래어 금기어 (무협/동양 판타지)
const FORBIDDEN_WORDS = [
  '오케이', 'OK', '팁', '마스터', '레벨', '패턴', '리듬', '타이밍',
  '센스', '포인트', '미션', '퀘스트', '스킬', '버프', '너프', '밸런스',
  '시스템', '업그레이드', '다운그레이드', '랭킹', '보너스', '이벤트',
  '갓', 'GOD', 'OP', '치트', '핵', '버그', '글리치',
];

// 절단신공 키워드 패턴
const CLIFFHANGER_PATTERNS = {
  crisis: /위기|곤경|함정|포위|죽음|절체절명|막다른|최후의/,
  discovery: /발견|드러나|정체가|진실이|비밀이|숨겨진|알게 되|깨달/,
  reversal: /반전|뒤집|예상[과치와]|믿을 수 없|설마|아닐|어떻게/,
  declaration: /선언|선포|맹세|약속|반드시|결의|다짐|각오/,
};

/**
 * 에피소드 퀄리티 검증
 */
export function validateEpisode(content: string): ValidationResult {
  const scores = {
    charCount: validateCharCount(content),
    cliffhanger: validateCliffhanger(content),
    showDontTell: validateShowDontTell(content),
    dialogueRatio: validateDialogueRatio(content),
    sentenceRhythm: validateSentenceRhythm(content),
    forbiddenWords: validateForbiddenWords(content),
  };

  // 가중치 적용 전체 점수 계산
  const weights = {
    charCount: 0.20,
    cliffhanger: 0.25,
    showDontTell: 0.20,
    dialogueRatio: 0.10,
    sentenceRhythm: 0.10,
    forbiddenWords: 0.15,
  };

  const overallScore = Math.round(
    scores.charCount.score * weights.charCount +
    scores.cliffhanger.score * weights.cliffhanger +
    scores.showDontTell.score * weights.showDontTell +
    scores.dialogueRatio.score * weights.dialogueRatio +
    scores.sentenceRhythm.score * weights.sentenceRhythm +
    scores.forbiddenWords.score * weights.forbiddenWords
  );

  // 통과 기준: 70점 이상 + 치명적 위반 없음
  const hasCriticalIssue =
    scores.charCount.status === 'under' ||
    scores.forbiddenWords.violationCount > 3;

  const passed = overallScore >= 70 && !hasCriticalIssue;

  // 개선 제안 생성
  const suggestions: string[] = [];
  const warnings: string[] = [];

  if (scores.charCount.status === 'under') {
    suggestions.push(`분량이 ${scores.charCount.charCount}자로 부족합니다. ${4000 - scores.charCount.charCount}자 이상 추가해주세요.`);
  } else if (scores.charCount.status === 'over') {
    warnings.push(`분량이 ${scores.charCount.charCount}자로 권장치를 초과했습니다.`);
  }

  if (scores.cliffhanger.score < 70) {
    suggestions.push('마지막 장면에 더 강한 클리프행어가 필요합니다. 위기/발견/반전/선언 중 하나로 끝내세요.');
  }

  if (scores.showDontTell.violations.length > 0) {
    const top3 = scores.showDontTell.violations.slice(0, 3);
    top3.forEach(v => {
      suggestions.push(`"${v.text}" → ${v.suggestion}`);
    });
  }

  if (!scores.dialogueRatio.isBalanced) {
    if (scores.dialogueRatio.dialoguePercent > 50) {
      suggestions.push('대사 비율이 너무 높습니다. 서술과 묘사를 더 추가해주세요.');
    } else if (scores.dialogueRatio.dialoguePercent < 20) {
      suggestions.push('대사 비율이 너무 낮습니다. 인물 간 대화를 추가해주세요.');
    }
  }

  if (!scores.sentenceRhythm.hasGoodRhythm) {
    suggestions.push('문장 리듬에 변화가 필요합니다. 짧은 문장과 긴 문장을 섞어주세요.');
  }

  if (scores.forbiddenWords.violations.length > 0) {
    scores.forbiddenWords.violations.forEach(v => {
      warnings.push(`금기어 "${v.word}" 발견: "${v.context}"`);
    });
  }

  return {
    overallScore,
    passed,
    scores,
    suggestions,
    warnings,
  };
}

/**
 * 분량 검증
 */
function validateCharCount(content: string): CharCountScore {
  const charCount = content.length;
  const target = { min: 4000, max: 6000 };

  let score: number;
  let status: 'under' | 'good' | 'over';

  if (charCount < target.min) {
    // 최소치 미만: 비례 점수
    score = Math.max(0, Math.round((charCount / target.min) * 70));
    status = 'under';
  } else if (charCount > target.max) {
    // 최대치 초과: 감점
    const overBy = charCount - target.max;
    score = Math.max(50, 100 - Math.round(overBy / 100) * 5);
    status = 'over';
  } else {
    // 적정 범위
    score = 100;
    status = 'good';
  }

  return { score, charCount, target, status };
}

/**
 * 절단신공 검증
 */
function validateCliffhanger(content: string): CliffhangerScore {
  // 마지막 500자 분석
  const lastPart = content.slice(-500);
  const sentences = lastPart.split(/[.!?]\s*/).filter(s => s.trim().length > 5);
  const lastSentences = sentences.slice(-3);
  const lastText = lastSentences.join(' ');

  let detectedType: string | null = null;
  let score = 50; // 기본 점수

  // 절단신공 패턴 검사
  if (CLIFFHANGER_PATTERNS.crisis.test(lastText)) {
    detectedType = '위기';
    score = 90;
  } else if (CLIFFHANGER_PATTERNS.discovery.test(lastText)) {
    detectedType = '발견';
    score = 85;
  } else if (CLIFFHANGER_PATTERNS.reversal.test(lastText)) {
    detectedType = '반전';
    score = 90;
  } else if (CLIFFHANGER_PATTERNS.declaration.test(lastText)) {
    detectedType = '선언';
    score = 80;
  }

  // 마침표로 끝나면 약간 감점 (느낌표/물음표가 더 강렬)
  if (lastText.trim().endsWith('.') && !detectedType) {
    score -= 10;
  }

  // 짧고 강렬한 마지막 문장 가산점
  const lastSentence = lastSentences[lastSentences.length - 1] || '';
  if (lastSentence.length < 30 && lastSentence.length > 5) {
    score = Math.min(100, score + 10);
  }

  const explanation = detectedType
    ? `"${detectedType}" 유형의 클리프행어가 감지되었습니다.`
    : '명확한 클리프행어 패턴이 감지되지 않았습니다.';

  return {
    score,
    lastSentences,
    detectedType,
    explanation,
  };
}

/**
 * Show Don't Tell 검증
 */
function validateShowDontTell(content: string): ShowDontTellScore {
  const violations: { text: string; suggestion: string }[] = [];

  TELL_PATTERNS.forEach(({ pattern, suggestion }) => {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // 컨텍스트 추출
        const idx = content.indexOf(match);
        const start = Math.max(0, idx - 10);
        const end = Math.min(content.length, idx + match.length + 10);
        const context = content.slice(start, end);

        violations.push({
          text: context.trim(),
          suggestion,
        });
      });
    }
  });

  // 중복 제거
  const uniqueViolations = violations.filter(
    (v, i, arr) => arr.findIndex(x => x.text === v.text) === i
  );

  // 점수 계산: 위반 1개당 -10점
  const score = Math.max(0, 100 - uniqueViolations.length * 10);

  return {
    score,
    violations: uniqueViolations.slice(0, 10), // 최대 10개만
    violationCount: uniqueViolations.length,
  };
}

/**
 * 대사 비율 검증
 */
function validateDialogueRatio(content: string): DialogueRatioScore {
  // 대사 추출 (따옴표로 둘러싸인 텍스트)
  const dialogueMatches = content.match(/[""][^""]+[""]/g) || [];
  const dialogueLength = dialogueMatches.join('').length;

  const totalLength = content.length;
  const dialoguePercent = Math.round((dialogueLength / totalLength) * 100);
  const narrativePercent = 100 - dialoguePercent;

  // 이상적인 비율: 대사 25~40%
  const isBalanced = dialoguePercent >= 20 && dialoguePercent <= 50;

  let score: number;
  if (isBalanced) {
    score = 100;
  } else if (dialoguePercent < 20) {
    score = 70 + dialoguePercent;
  } else {
    score = Math.max(50, 100 - (dialoguePercent - 50));
  }

  return {
    score,
    dialoguePercent,
    narrativePercent,
    isBalanced,
  };
}

/**
 * 문장 리듬 검증
 */
function validateSentenceRhythm(content: string): SentenceRhythmScore {
  const sentences = content.split(/[.!?]\s*/).filter(s => s.trim().length > 0);

  if (sentences.length === 0) {
    return {
      score: 50,
      avgSentenceLength: 0,
      shortSentenceRatio: 0,
      longSentenceRatio: 0,
      hasGoodRhythm: false,
    };
  }

  const lengths = sentences.map(s => s.length);
  const avgSentenceLength = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);

  // 짧은 문장 (15자 이하), 긴 문장 (40자 이상) 비율
  const shortSentences = lengths.filter(l => l <= 15).length;
  const longSentences = lengths.filter(l => l >= 40).length;

  const shortSentenceRatio = Math.round((shortSentences / sentences.length) * 100);
  const longSentenceRatio = Math.round((longSentences / sentences.length) * 100);

  // 좋은 리듬: 짧은 문장 20~40%, 긴 문장 10~30%
  const hasGoodRhythm =
    shortSentenceRatio >= 15 && shortSentenceRatio <= 50 &&
    longSentenceRatio >= 5 && longSentenceRatio <= 40;

  let score: number;
  if (hasGoodRhythm) {
    score = 100;
  } else {
    // 단조로운 리듬 감점
    const varietyScore = Math.abs(shortSentenceRatio - 30) + Math.abs(longSentenceRatio - 20);
    score = Math.max(50, 100 - varietyScore);
  }

  return {
    score,
    avgSentenceLength,
    shortSentenceRatio,
    longSentenceRatio,
    hasGoodRhythm,
  };
}

/**
 * 금기어 검증
 */
function validateForbiddenWords(content: string): ForbiddenWordsScore {
  const violations: { word: string; context: string }[] = [];

  FORBIDDEN_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const start = Math.max(0, match.index - 15);
      const end = Math.min(content.length, match.index + word.length + 15);
      violations.push({
        word,
        context: content.slice(start, end).trim(),
      });
    }
  });

  // 점수: 위반 1개당 -20점
  const score = Math.max(0, 100 - violations.length * 20);

  return {
    score,
    violations: violations.slice(0, 10),
    violationCount: violations.length,
  };
}

/**
 * 빠른 검증 (핵심 항목만)
 */
export function quickValidate(content: string): {
  charCount: number;
  passed: boolean;
  issues: string[];
} {
  const charCount = content.length;
  const issues: string[] = [];

  if (charCount < 3500) {
    issues.push(`분량 부족 (${charCount}자 / 최소 4,000자)`);
  }

  if (charCount > 7000) {
    issues.push(`분량 초과 (${charCount}자 / 최대 6,000자)`);
  }

  // 금기어 빠른 체크
  const foundForbidden = FORBIDDEN_WORDS.filter(word =>
    content.toLowerCase().includes(word.toLowerCase())
  );
  if (foundForbidden.length > 0) {
    issues.push(`금기어 발견: ${foundForbidden.join(', ')}`);
  }

  return {
    charCount,
    passed: issues.length === 0,
    issues,
  };
}

/**
 * 1화 특화 검증 (추가 규칙 적용)
 */
export function validateFirstEpisode(content: string): ValidationResult & {
  firstEpisodeChecks: {
    hasStrongOpening: boolean;
    hasProtagonistIntro: boolean;
    hasWorldHint: boolean;
    hasHook: boolean;
  };
} {
  const baseResult = validateEpisode(content);

  // 1화 특화 체크
  const first500 = content.slice(0, 500);
  const firstEpisodeChecks = {
    // 강렬한 시작 (액션, 감각, 위기로 시작)
    hasStrongOpening: /피|칼|검|죽|싸|소리|냄새|차가|뜨거/.test(first500),
    // 주인공 소개
    hasProtagonistIntro: /그는|청년|이름은|불리|라고 했/.test(first500),
    // 세계관 힌트
    hasWorldHint: /강호|무림|문파|내공|무공/.test(content.slice(0, 1500)),
    // 떡밥/미스터리 제시
    hasHook: /비밀|미스터리|의문|정체|숨겨진|과거/.test(content),
  };

  // 1화 보너스/감점
  let firstEpisodeBonus = 0;
  if (firstEpisodeChecks.hasStrongOpening) firstEpisodeBonus += 3;
  if (firstEpisodeChecks.hasProtagonistIntro) firstEpisodeBonus += 2;
  if (firstEpisodeChecks.hasWorldHint) firstEpisodeBonus += 2;
  if (firstEpisodeChecks.hasHook) firstEpisodeBonus += 3;

  // 1화 필수 요소 미충족 시 경고
  if (!firstEpisodeChecks.hasStrongOpening) {
    baseResult.warnings.push('1화 시작이 약합니다. 감각적이고 강렬한 첫 문장이 필요합니다.');
  }
  if (!firstEpisodeChecks.hasProtagonistIntro) {
    baseResult.warnings.push('주인공 소개가 부족해 보입니다.');
  }
  if (!firstEpisodeChecks.hasHook) {
    baseResult.suggestions.push('1화에 미스터리나 떡밥을 심어 독자의 궁금증을 유발하세요.');
  }

  return {
    ...baseResult,
    overallScore: Math.min(100, baseResult.overallScore + firstEpisodeBonus),
    firstEpisodeChecks,
  };
}
