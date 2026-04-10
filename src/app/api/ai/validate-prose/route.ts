import { NextRequest, NextResponse } from 'next/server';
import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';
import { generateOpenAIText } from '@/lib/ai/openai-client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SlidingWindowContext } from '@/types/memory';

interface ValidateRequest {
  projectId: string;
  content: string;
  episodeNumber: number;
}

type CheckId = 'sentence_split' | 'consistency' | 'continuity' | 'show_not_tell' | 'vocabulary';

interface CheckResult {
  id: CheckId;
  label: string;
  passed: boolean;
  score: number;
  comment: string;
}

interface ParsedResult {
  overallScore: number;
  passed: boolean;
  summary: string;
  checks: CheckResult[];
  suggestions: string[];
}

const SYSTEM_PROMPT = `
You are a ruthless chief editor for Korean serialized webnovels.
You NEVER rewrite prose. You only judge and report.

Evaluate exactly these 5 checks:
1) sentence_split: did the draft avoid broken staccato-like paragraph splitting?
2) consistency: world, character, and synopsis consistency.
3) continuity: natural connection to prior episode flow.
4) show_not_tell: did it show through action/sensory detail instead of dry explanation?
5) vocabulary: does it use era/world-appropriate vocabulary without modern mismatch?

Critical fail-first policy:
- The user-provided synopsis/story bible is the absolute source of truth.
- If the prose invents a different era/background/character not grounded in synopsis/world/character context, consistency MUST fail.
- On such mismatch, set:
  - consistency.passed = false
  - consistency.score <= 20
  - passed = false
  - overallScore <= 40
  - summary must mention synopsis mismatch in Korean.

Return ONLY JSON:
{
  "overallScore": number,
  "passed": boolean,
  "summary": "short Korean sentence",
  "checks": [
    {
      "id": "sentence_split|consistency|continuity|show_not_tell|vocabulary",
      "label": "Korean label",
      "passed": boolean,
      "score": number,
      "comment": "specific Korean comment"
    }
  ],
  "suggestions": ["Korean actionable suggestion"]
}
`;

const CAUSALITY_APPENDIX = `
Additional causality checks (map into existing 5 checks, do not add new id):
- Atomization: verify major beats are not collapsed into one sentence; A(inciting contact) -> B(inner interpretation) -> C(action/result) bridge should be visible.
- Trigger chain: verify each beat causally triggers the next beat, not summary jump.
- Character reaction: verify character-specific reaction exists between event and result.
- Showing: penalize direct emotion telling when body/sensory showing is possible.
If weak, reflect in sentence_split / continuity / show_not_tell comments and score.
`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as ValidateRequest;
    if (!body.projectId || !body.episodeNumber || !body.content) {
      return NextResponse.json(
        { error: 'projectId, episodeNumber, content are required.' },
        { status: 400 }
      );
    }

    if (body.content.trim().length < 100) {
      return NextResponse.json(
        { error: 'At least 100 characters are required for validation.' },
        { status: 400 }
      );
    }

    const context = await buildSlidingWindowContext(body.projectId, body.episodeNumber, {
      windowSize: 3,
      includeWritingPreferences: false,
      includeSynopses: true,
      includeTimelineEvents: true,
    });

    const model = process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4o';
    const response = await generateOpenAIText({
      model,
      systemPrompt: `${SYSTEM_PROMPT}\n\n${CAUSALITY_APPENDIX}`,
      userPrompt: buildUserPrompt(body.content, body.episodeNumber, context),
      temperature: 0.2,
      maxOutputTokens: 1400,
    });

    const result = parseResult(response.text);
    const gateAdjusted = enforceFeaturedCharacterGate(
      result,
      body.content,
      body.episodeNumber,
      context
    );

    return NextResponse.json({
      mode: 'openai_validate_prose',
      model,
      result: gateAdjusted,
      usage: {
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      },
    });
  } catch (error) {
    console.error('[validate-prose] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Validation failed' },
      { status: 500 }
    );
  }
}

function buildUserPrompt(content: string, episodeNumber: number, context: SlidingWindowContext) {
  const synopsis = context.episodeSynopses?.find(
    (row) => row.isCurrent || row.episodeNumber === episodeNumber
  );

  const worldRules = Array.isArray(context.worldBible?.absolute_rules)
    ? context.worldBible.absolute_rules.slice(0, 8).join('\n- ')
    : '';

  const characters = context.activeCharacters
    .slice(0, 8)
    .map(
      (char) =>
        `${char.name} | 위치:${char.currentLocation || '미상'} | 감정:${char.emotionalState || '미상'}`
    )
    .join('\n');

  const recentLogs = context.recentLogs
    .slice(0, 3)
    .map((log) => `${log.episodeNumber}화: ${truncate(log.summary, 220)}`)
    .join('\n');

  const transitionContract = context.transitionContract
    ? [
        `[source:${context.transitionContract.sourceEpisodeNumber} -> target:${context.transitionContract.targetEpisodeNumber}]`,
        `anchor1: ${context.transitionContract.anchor1}`,
        `anchor2: ${context.transitionContract.anchor2}`,
        `anchor3: ${context.transitionContract.anchor3}`,
        `guardrail: ${context.transitionContract.openingGuardrail || '-'}`,
      ].join('\n')
    : '없음';

  const previousSnapshots = (context.previousCharacterSnapshots || [])
    .slice(0, 8)
    .map(
      (snap) =>
        `${snap.name} | 위치:${snap.location || '미상'} | 감정:${snap.emotionalState || '미상'} | 부상:${snap.injuries?.join(', ') || '없음'}`
    )
    .join('\n');

  return `
[스토리 바이블 절대 우선 규칙]
사용자 제공 시놉시스/세계관/캐릭터 설정이 절대 기준이다.
불일치한 배경, 인물, 사건이 보이면 consistency를 즉시 FAIL 처리하라.

[검증 대상 본문]
${content}

[현재 회차 시놉시스]
${synopsis?.synopsis || '없음'}

[컨텍스트]
- 세계관 규칙:
- ${worldRules || '없음'}
- 직전 로그:
${recentLogs || '없음'}
- 직전 엔딩 앵커:
${truncate(context.previousEpisodeEnding || context.lastSceneAnchor || '', 500) || '없음'}
- 캐릭터 상태:
${characters || '없음'}
- 전환 계약(Transition Contract):
${transitionContract}
- 직전 캐릭터 스냅샷:
${previousSnapshots || '없음'}
`;
}

function parseResult(raw: string): ParsedResult {
  const obj = parseJson(raw);
  if (!obj) {
    return buildValidatorFormatFallbackResult();
  }
  const checks = normalizeChecks(obj.checks);
  const safeChecks = checks.length ? checks : defaultChecks();

  let overallScore = clampNumber(
    typeof obj.overallScore === 'number'
      ? obj.overallScore
      : Math.round(safeChecks.reduce((sum, check) => sum + check.score, 0) / safeChecks.length)
  );

  let passed =
    typeof obj.passed === 'boolean'
      ? obj.passed
      : overallScore >= 70 && safeChecks.every((check) => check.passed);

  let summary =
    typeof obj.summary === 'string' && obj.summary.trim()
      ? obj.summary.trim()
      : passed
      ? '전반적으로 기준을 충족했습니다.'
      : '일부 항목에서 개선이 필요합니다.';

  const suggestions = Array.isArray(obj.suggestions)
    ? obj.suggestions.filter((item): item is string => typeof item === 'string').slice(0, 5)
    : [];

  const consistencyCheck = safeChecks.find((check) => check.id === 'consistency');
  if (consistencyCheck && !consistencyCheck.passed) {
    passed = false;
    overallScore = Math.min(overallScore, 40);
    const loweredSummary = summary.toLowerCase();
    if (!loweredSummary.includes('synopsis') && !loweredSummary.includes('mismatch')) {
      summary = `Synopsis mismatch FAIL: ${summary}`;
    }
  }

  return {
    overallScore,
    passed,
    summary,
    checks: safeChecks,
    suggestions,
  };
}

function buildValidatorFormatFallbackResult(): ParsedResult {
  const checks = defaultChecks();
  const consistencyIndex = checks.findIndex((check) => check.id === 'consistency');
  if (consistencyIndex >= 0) {
    checks[consistencyIndex] = {
      ...checks[consistencyIndex],
      passed: false,
      score: 10,
      comment: '검수 모델 응답 형식(JSON) 오류로 자동 FAIL 처리',
    };
  }

  return {
    overallScore: 20,
    passed: false,
    summary: 'Validator format FAIL: JSON 응답을 파싱하지 못했습니다.',
    checks,
    suggestions: ['다시 검증을 실행하거나, 생성 본문을 일부 수정한 뒤 재검증하세요.'],
  };
}

function enforceFeaturedCharacterGate(
  result: ParsedResult,
  content: string,
  episodeNumber: number,
  context: SlidingWindowContext
): ParsedResult {
  const synopsis = context.episodeSynopses?.find(
    (item) => item.isCurrent || item.episodeNumber === episodeNumber
  );
  const featured = new Set(
    (synopsis?.featuredCharacters || [])
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.replace(/\s+/g, '').trim())
      .filter(Boolean)
  );

  if (!featured.size) return result;

  const knownNames = context.activeCharacters
    .map((character) => (character.name || '').replace(/\s+/g, '').trim())
    .filter(Boolean);

  const violations = knownNames.filter((name) => {
    if (featured.has(name)) return false;
    const count = countNameMentions(content, name);
    const threshold = episodeNumber <= 2 ? 1 : 2;
    return count >= threshold;
  });

  if (!violations.length) return result;

  const checks = [...result.checks];
  const consistencyIndex = checks.findIndex((check) => check.id === 'consistency');
  const violationComment = `허용 외 캐릭터 조기 등장: ${violations.join(', ')}`;

  if (consistencyIndex >= 0) {
    checks[consistencyIndex] = {
      ...checks[consistencyIndex],
      passed: false,
      score: Math.min(checks[consistencyIndex].score, 20),
      comment: violationComment,
    };
  }

  const suggestions = [
    ...result.suggestions,
    `이번 화 등장 허용 캐릭터(${Array.from(featured).join(', ')})만 직접 등장시키고, 나머지는 삭제/간접 언급 처리하세요.`,
  ].slice(0, 6);

  return {
    overallScore: Math.min(result.overallScore, 40),
    passed: false,
    summary: `Synopsis mismatch FAIL: 허용 외 캐릭터 조기 등장 (${violations.join(', ')})`,
    checks,
    suggestions,
  };
}

function countNameMentions(content: string, name: string): number {
  if (!name) return 0;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'g');
  return content.match(regex)?.length || 0;
}

function parseJson(raw: string): Record<string, unknown> | null {
  const direct = raw.trim();
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const brace = raw.match(/\{[\s\S]*\}/)?.[0]?.trim();

  const candidates = [direct, fenced, brace].filter(
    (item): item is string => typeof item === 'string' && item.length > 0
  );

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  return null;
}

function normalizeChecks(raw: unknown): CheckResult[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const id = normalizeId(String(item.id || ''));
      const score = clampNumber(typeof item.score === 'number' ? item.score : 70);
      const passed = typeof item.passed === 'boolean' ? item.passed : score >= 70;

      return {
        id,
        label: (typeof item.label === 'string' && item.label.trim()) || defaultLabel(id),
        passed,
        score,
        comment: (typeof item.comment === 'string' && item.comment.trim()) || '코멘트 없음',
      };
    });
}

function normalizeId(raw: string): CheckId {
  const source = raw.toLowerCase();
  if (source.includes('split') || source.includes('sentence')) return 'sentence_split';
  if (source.includes('continu')) return 'continuity';
  if (source.includes('show') || source.includes('tell')) return 'show_not_tell';
  if (source.includes('vocab') || source.includes('term') || source.includes('era')) return 'vocabulary';
  return 'consistency';
}

function defaultChecks(): CheckResult[] {
  return [
    { id: 'sentence_split', label: defaultLabel('sentence_split'), passed: true, score: 70, comment: '기본값' },
    { id: 'consistency', label: defaultLabel('consistency'), passed: true, score: 70, comment: '기본값' },
    { id: 'continuity', label: defaultLabel('continuity'), passed: true, score: 70, comment: '기본값' },
    { id: 'show_not_tell', label: defaultLabel('show_not_tell'), passed: true, score: 70, comment: '기본값' },
    { id: 'vocabulary', label: defaultLabel('vocabulary'), passed: true, score: 70, comment: '기본값' },
  ];
}

function defaultLabel(id: CheckId) {
  switch (id) {
    case 'sentence_split':
      return '문장/문단 호흡';
    case 'consistency':
      return '설정/캐릭터 일관성';
    case 'continuity':
      return '회차 연속성';
    case 'show_not_tell':
      return '보여주기 준수';
    case 'vocabulary':
      return '시대 어휘 준수';
  }
}

function clampNumber(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function truncate(value: string, max: number) {
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max).trimEnd()}...`;
}
