import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';
import { parseAndRemoveLogicCheck } from '@/core/engine/prompt-injector';
import { generateEpisodeWithOrchestrator } from '@/core/engine/writing-orchestrator';
import { saveGenerationTrace } from '@/core/engine/generation-trace-store';
import { normalizeSerialParagraphs, trimReplayRestart } from '@/lib/editor/serial-normalizer';
import { generateOpenAIText } from '@/lib/ai/openai-client';

const DEFAULT_TIMEZONE = 'Asia/Seoul';

export interface AutoWritingConfig {
  enabled: boolean;
  startTime: string; // HH:mm
  runsPerDay: number; // 1~3
  timezone: string;
  instructionTemplate: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface AutoWritingRunResult {
  ok: boolean;
  reason?: string;
  projectId: string;
  episodeNumber?: number;
  episodeId?: string;
  gptReview: {
    passed: boolean;
    score: number;
    summary: string;
    model: string;
  } | null;
  geminiReview: {
    passed: boolean;
    score: number;
    summary: string;
    model: string;
    skipped?: boolean;
  } | null;
}

const DEFAULT_CONFIG: AutoWritingConfig = {
  enabled: false,
  startTime: '09:00',
  runsPerDay: 3,
  timezone: DEFAULT_TIMEZONE,
  instructionTemplate:
    '현재 프로젝트의 세계관, 캐릭터, 스토리바이블, 연속성을 엄수해 다음 회차를 작성하라. 반드시 장면이 완결되도록 마무리하라.',
  nextRunAt: null,
  lastRunAt: null,
};

export function normalizeAutoWritingConfig(raw: unknown): AutoWritingConfig {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const enabled = Boolean(source.enabled);
  const runsPerDayRaw = Number(source.runsPerDay ?? DEFAULT_CONFIG.runsPerDay);
  const runsPerDay = Number.isFinite(runsPerDayRaw)
    ? Math.max(1, Math.min(3, Math.floor(runsPerDayRaw)))
    : DEFAULT_CONFIG.runsPerDay;
  const startTime = normalizeTimeString(
    typeof source.startTime === 'string' ? source.startTime : DEFAULT_CONFIG.startTime
  );
  const timezone =
    typeof source.timezone === 'string' && source.timezone.trim()
      ? source.timezone.trim()
      : DEFAULT_CONFIG.timezone;
  const instructionTemplate =
    typeof source.instructionTemplate === 'string' && source.instructionTemplate.trim()
      ? source.instructionTemplate.trim()
      : DEFAULT_CONFIG.instructionTemplate;
  const nextRunAt = typeof source.nextRunAt === 'string' && source.nextRunAt ? source.nextRunAt : null;
  const lastRunAt = typeof source.lastRunAt === 'string' && source.lastRunAt ? source.lastRunAt : null;

  return {
    enabled,
    startTime,
    runsPerDay,
    timezone,
    instructionTemplate,
    nextRunAt,
    lastRunAt,
  };
}

export function mergeGenerationConfigWithAutoWriting(
  generationConfig: unknown,
  autoWritingConfig: AutoWritingConfig
): Record<string, unknown> {
  const base =
    generationConfig && typeof generationConfig === 'object'
      ? { ...(generationConfig as Record<string, unknown>) }
      : {};
  return {
    ...base,
    autoWriting: autoWritingConfig,
  };
}

export function computeNextRunAt(config: AutoWritingConfig, now = new Date()): string {
  const offsetMinutes = timezoneToOffsetMinutes(config.timezone);
  const offsetMs = offsetMinutes * 60 * 1000;
  const nowLocalMs = now.getTime() + offsetMs;
  const nowLocal = new Date(nowLocalMs);
  const dayStartUtcMs = Date.UTC(
    nowLocal.getUTCFullYear(),
    nowLocal.getUTCMonth(),
    nowLocal.getUTCDate(),
    0,
    0,
    0,
    0
  );

  const [hour, minute] = parseTime(config.startTime);
  const intervalMinutes = Math.max(1, Math.floor((24 * 60) / Math.max(1, config.runsPerDay)));

  const candidatesLocalMs: number[] = [];
  for (let i = 0; i < config.runsPerDay; i += 1) {
    const minutes = hour * 60 + minute + intervalMinutes * i;
    candidatesLocalMs.push(dayStartUtcMs + minutes * 60 * 1000);
  }

  const nextLocalMs =
    candidatesLocalMs.find((candidate) => candidate > nowLocalMs) ??
    dayStartUtcMs + (24 * 60 + hour * 60 + minute) * 60 * 1000;

  return new Date(nextLocalMs - offsetMs).toISOString();
}

export async function runAutoWritingCycle(params: {
  supabase: any;
  projectId: string;
  config: AutoWritingConfig;
}): Promise<AutoWritingRunResult> {
  const { supabase, projectId, config } = params;

  const { data: latestEpisode, error: latestError } = await supabase
    .from('episodes')
    .select('id, episode_number, status')
    .eq('project_id', projectId)
    .order('episode_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return {
      ok: false,
      reason: latestError.message,
      projectId,
      gptReview: null,
      geminiReview: null,
    };
  }

  if (latestEpisode && latestEpisode.status !== 'published') {
    return {
      ok: false,
      reason: 'awaiting_user_final_proof',
      projectId,
      gptReview: null,
      geminiReview: null,
    };
  }

  const targetEpisodeNumber = Number(latestEpisode?.episode_number || 0) + 1;
  const context = await buildSlidingWindowContext(projectId, targetEpisodeNumber, {
    windowSize: 4,
    includeWritingPreferences: true,
    includeSynopses: true,
    includeTimelineEvents: true,
  });

  const currentSynopsis =
    context.episodeSynopses?.find((item) => item.isCurrent || item.episodeNumber === targetEpisodeNumber) || null;

  const instruction = [
    '[AUTO WRITING]',
    config.instructionTemplate,
    currentSynopsis?.synopsis ? `[현재 회차 시놉시스]\n${currentSynopsis.synopsis}` : '',
    '중복 없이 전개하고, 결말을 완결된 문장으로 마무리하라.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const orchestration = await generateEpisodeWithOrchestrator({
    projectId,
    targetEpisodeNumber,
    userInstruction: instruction,
    context,
    requestedMode: 'claude_legacy',
    compareModes: false,
  });

  const { cleanContent } = parseAndRemoveLogicCheck(orchestration.fullText);
  const finalContent = normalizeSerialParagraphs(trimReplayRestart(cleanContent)).trim();

  if (!finalContent || finalContent.length < 200) {
    return {
      ok: false,
      reason: 'generated_content_too_short',
      projectId,
      gptReview: null,
      geminiReview: null,
    };
  }

  const gptReview = await runGptFirstPassReview({
    content: finalContent,
    synopsis: currentSynopsis?.synopsis || '',
  });
  const geminiReview = await runGeminiFirstPassReview({
    content: finalContent,
    synopsis: currentSynopsis?.synopsis || '',
  });

  const { data: insertedEpisode, error: insertError } = await supabase
    .from('episodes')
    .insert({
      project_id: projectId,
      episode_number: targetEpisodeNumber,
      title: `${targetEpisodeNumber}화`,
      content: finalContent,
      original_content: finalContent,
      char_count: finalContent.length,
      status: 'review',
      log_status: 'pending',
      log_retry_count: 0,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertError) {
    return {
      ok: false,
      reason: insertError.message,
      projectId,
      gptReview,
      geminiReview,
    };
  }

  await saveGenerationTrace({
    projectId,
    episodeId: insertedEpisode.id,
    targetEpisodeNumber,
    userInstruction: instruction,
    finalContent,
    trace: {
      ...orchestration.trace,
      validation: {
        overallScore: Math.round((gptReview.score + geminiReview.score) / 2),
        passed: Boolean(gptReview.passed && geminiReview.passed),
        suggestions: [gptReview.summary, geminiReview.summary].filter(Boolean),
      },
    },
  });

  return {
    ok: true,
    projectId,
    episodeNumber: targetEpisodeNumber,
    episodeId: insertedEpisode.id,
    gptReview,
    geminiReview,
  };
}

function normalizeTimeString(time: string): string {
  const [h, m] = parseTime(time);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseTime(time: string): [number, number] {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(time.trim());
  if (!match) return [9, 0];
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const minute = Math.max(0, Math.min(59, Number(match[2])));
  return [hour, minute];
}

function timezoneToOffsetMinutes(timezone: string): number {
  if (timezone === 'Asia/Seoul') return 9 * 60;
  return 0;
}

async function runGptFirstPassReview(params: {
  content: string;
  synopsis: string;
}): Promise<{ passed: boolean; score: number; summary: string; model: string }> {
  const model = process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4o';
  const response = await generateOpenAIText({
    model,
    systemPrompt:
      'You are a strict webnovel first-pass reviewer. Return JSON only: {"passed":boolean,"score":number,"summary":"Korean short review"}',
    userPrompt: [
      '[검수 기준]',
      '- 시놉시스 일치',
      '- 연속성',
      '- 문단 호흡',
      '- 사건 압축 금지',
      '',
      '[시놉시스]',
      params.synopsis || '없음',
      '',
      '[본문]',
      params.content,
    ].join('\n'),
    temperature: 0.2,
    maxOutputTokens: 500,
  });

  const parsed = parseJsonObject(response.text);
  const score = clampScore(parsed.score);
  return {
    passed: Boolean(parsed.passed ?? score >= 70),
    score,
    summary: String(parsed.summary || 'GPT 1차 검수 완료'),
    model,
  };
}

async function runGeminiFirstPassReview(params: {
  content: string;
  synopsis: string;
}): Promise<{ passed: boolean; score: number; summary: string; model: string; skipped?: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_VALIDATOR_MODEL || 'gemini-1.5-pro';

  if (!apiKey) {
    return {
      passed: true,
      score: 75,
      summary: 'Gemini API 키 미설정으로 Gemini 검수는 건너뛰었습니다.',
      model,
      skipped: true,
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const prompt = [
    'Return JSON only: {"passed":boolean,"score":number,"summary":"Korean short review"}',
    '[검수 기준] 시놉시스 일치, 연속성, 문단 호흡, 사건 압축 금지',
    '[시놉시스]',
    params.synopsis || '없음',
    '[본문]',
    params.content,
  ].join('\n\n');

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      return {
        passed: true,
        score: 70,
        summary: `Gemini 검수 실패(${response.status})로 검수를 생략했습니다.`,
        model,
        skipped: true,
      };
    }

    const payload = (await response.json()) as any;
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseJsonObject(String(text));
    const score = clampScore(parsed.score);
    return {
      passed: Boolean(parsed.passed ?? score >= 70),
      score,
      summary: String(parsed.summary || 'Gemini 1차 검수 완료'),
      model,
    };
  } catch {
    return {
      passed: true,
      score: 70,
      summary: 'Gemini 검수 호출 중 예외가 발생해 생략했습니다.',
      model,
      skipped: true,
    };
  }
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const block =
    raw.match(/```json\s*([\s\S]*?)\s*```/i)?.[1] ||
    raw.match(/\{[\s\S]*\}/)?.[0] ||
    '{}';

  try {
    return JSON.parse(block) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function clampScore(value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score)) return 70;
  return Math.max(0, Math.min(100, Math.round(score)));
}
