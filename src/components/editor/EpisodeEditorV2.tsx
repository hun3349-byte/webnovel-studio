'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSerialParagraphs, trimReplayRestart, formatForNaverMobile } from '@/lib/editor/serial-normalizer';

type Tab = 'setup' | 'workspace';
type Flow = 'idle' | 'drafting' | 'drafted' | 'validating' | 'validation_passed' | 'validation_failed' | 'revising' | 'saving' | 'saved';
type CheckId = 'sentence_split' | 'consistency' | 'continuity' | 'show_not_tell' | 'vocabulary';

interface Props { projectId: string; episodeId: string; }
interface Episode { id: string; episode_number: number; title: string | null; content: string | null; original_content: string | null; status: 'draft' | 'generating' | 'review' | 'published'; }
interface World { id?: string; world_name: string | null; time_period: string | null; geography: string | null; absolute_rules: string[] | null; forbidden_elements: string[] | null; }
interface Character { id?: string; name: string; role: string | null; personality: string | null; }
interface Synopsis { id?: string; episode_number: number; synopsis: string; key_events: string[] | null; forbidden?: string | null; }
interface Hook { id?: string; summary: string; detail: string | null; status: string | null; importance: number | null; hook_type: string | null; }
interface Check { id: CheckId; label: string; passed: boolean; score: number; comment: string; }
interface Report { passed: boolean; overallScore: number; summary: string; checks: Check[]; suggestions: string[]; model: string; stale: boolean; }
interface AutoWritingConfig {
  enabled: boolean;
  startTime: string;
  runsPerDay: number;
  timezone: string;
  instructionTemplate: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
}
interface TransitionContractForm {
  sourceEpisodeNumber: number;
  targetEpisodeNumber: number;
  anchor1: string;
  anchor2: string;
  anchor3: string;
  openingGuardrail: string;
}

const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
const parse = (v: string) => { try { return JSON.parse(v) as Record<string, unknown>; } catch { return null; } };
const buildDefaultTransitionContract = (episodeNumber: number): TransitionContractForm => ({
  sourceEpisodeNumber: episodeNumber,
  targetEpisodeNumber: episodeNumber + 1,
  anchor1: '',
  anchor2: '',
  anchor3: '',
  openingGuardrail: '다음 화 시작 400자 이내에 직전 화 마지막 장면의 감정/행동 결과를 즉시 이어서 시작한다.',
});
const clean = (v: string) => {
  let n = v.replace(/<logic_check>[\s\S]*?<\/logic_check>/g, '');
  const i = n.indexOf('[Prose]');
  if (i >= 0) n = n.slice(i + '[Prose]'.length);
  return normalizeSerialParagraphs(trimReplayRestart(n.trim()));
};

const ENDING_FEEDBACK_PATTERN = /(마지막|엔딩|결말|끝부분|마무리|라스트|끝맺|ending|final)/i;
const OPENING_FEEDBACK_PATTERN = /(첫|도입|오프닝|시작부|초반|opening|intro)/i;

const CONTINUE_FEEDBACK_PATTERN =
  /(이어서|이어쓰기|이어\s*써|이어\s*써줘|계속|계속\s*써|후속|다음\s*장면|다음\s*문단|계속\s*작성|continue|keep writing|continue writing)/i;

function withRewriteGuardrails(feedback: string): string {
  return [
    feedback.trim(),
    '',
    '[Rewrite Guardrails]',
    '- Keep chronology and scene order exactly.',
    '- Do not restart from beginning unless selected range includes beginning.',
    '- Preserve existing world/synopsis/character continuity.',
    '- Avoid duplicated paragraphs and repeated exposition.',
    '- Keep names, facts, and causal chain unchanged unless feedback explicitly asks.',
  ]
    .filter(Boolean)
    .join('\n');
}

function alignRangeToParagraph(content: string, start: number, end: number) {
  const safeStart = Math.max(0, Math.min(start, content.length));
  const safeEnd = Math.max(safeStart, Math.min(end, content.length));

  const before = content.lastIndexOf('\n\n', safeStart);
  const after = content.indexOf('\n\n', safeEnd);

  const alignedStart = before >= 0 ? before + 2 : 0;
  const alignedEnd = after >= 0 ? after : content.length;

  if (alignedEnd <= alignedStart) {
    return { start: safeStart, end: safeEnd };
  }

  return { start: alignedStart, end: alignedEnd };
}

function inferFeedbackRange(content: string, feedback: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (/(마지막|엔딩|결말|끝맺|마무리|ending|final)/i.test(feedback)) {
    return {
      ...alignRangeToParagraph(content, Math.max(0, content.length - 1400), content.length),
      label: 'ending section',
    };
  }

  if (/(초반|오프닝|도입|첫 문단|opening|intro)/i.test(feedback)) {
    return {
      ...alignRangeToParagraph(content, 0, Math.min(content.length, 1400)),
      label: 'opening section',
    };
  }

  if (/(설정 오류|설정오류|개연성|연속성|맥락|모순|continuity|consistency)/i.test(feedback)) {
    return {
      ...alignRangeToParagraph(content, Math.max(0, content.length - 1200), content.length),
      label: 'continuity-sensitive section',
    };
  }

  if (ENDING_FEEDBACK_PATTERN.test(feedback)) {
    return {
      ...alignRangeToParagraph(content, Math.max(0, content.length - 1400), content.length),
      label: '마지막 장면',
    };
  }

  if (OPENING_FEEDBACK_PATTERN.test(feedback)) {
    return {
      ...alignRangeToParagraph(content, 0, Math.min(content.length, 1400)),
      label: '초반 장면',
    };
  }

  if (/설정오류|설정 오류|개연성|연속성|모순/.test(feedback)) {
    return {
      ...alignRangeToParagraph(content, Math.max(0, content.length - 1200), content.length),
      label: '설정 점검 구간',
    };
  }

  return null;
}

export function EpisodeEditorV2({ projectId, episodeId }: Props) {
  const [tab, setTab] = useState<Tab>('workspace');
  const [loading, setLoading] = useState(true);
  const [setupSaving, setSetupSaving] = useState(false);
  const [flow, setFlow] = useState<Flow>('idle');
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState<string | null>(null);
  const [pd, setPd] = useState('');
  const [feedback, setFeedback] = useState('');
  const [world, setWorld] = useState<World | null>(null);
  const [chars, setChars] = useState<Character[]>([]);
  const [synopsis, setSynopsis] = useState<Synopsis | null>(null);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [transitionContract, setTransitionContract] = useState<TransitionContractForm | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [autoWriting, setAutoWriting] = useState<AutoWritingConfig>({
    enabled: false,
    startTime: '09:00',
    runsPerDay: 3,
    timezone: 'Asia/Seoul',
    instructionTemplate:
      '현재 프로젝트의 세계관, 캐릭터, 스토리바이블, 연속성을 엄수해 다음 회차를 작성하라. 반드시 장면이 완결되도록 마무리하라.',
    nextRunAt: null,
    lastRunAt: null,
  });
  const [autoBusy, setAutoBusy] = useState(false);
  const [partialBusy, setPartialBusy] = useState(false);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [epR, wR, cR, sR, autoR] = await Promise.all([
        fetch(`/api/projects/${projectId}/episodes/${episodeId}`),
        fetch(`/api/projects/${projectId}/world-bible`),
        fetch(`/api/projects/${projectId}/characters`),
        fetch(`/api/projects/${projectId}/story-bible`),
        fetch(`/api/projects/${projectId}/auto-writing`),
      ]);
      if (!epR.ok) throw new Error('Failed to load episode.');
      const epJ = await epR.json();
      const ep = epJ.episode as Episode;
      const hooksRes = await fetch(
        `/api/projects/${projectId}/hooks?status=all&limit=50&episodeNumber=${ep.episode_number}`
      );
      const contractRes = await fetch(
        `/api/projects/${projectId}/transition-contracts?sourceEpisodeNumber=${ep.episode_number}`
      );
      setEpisode(ep); setTitle(ep.title ?? `${ep.episode_number} Episode`); setContent(ep.content ?? ''); setOriginal(ep.original_content ?? null); setFlow((ep.content ?? '').trim() ? 'drafted' : 'idle');
      setWorld(wR.ok ? (await wR.json()).worldBible ?? null : null);
      setChars(cR.ok ? (await cR.json()).characters ?? [] : []);
      if (sR.ok) {
        const rows = ((await sR.json()).synopses ?? []) as Synopsis[];
        const cur = rows.find((x) => Number(x.episode_number) === Number(ep.episode_number));
        setSynopsis(cur ? { ...cur, key_events: cur.key_events ?? [], forbidden: cur.forbidden ?? '' } : { episode_number: ep.episode_number, synopsis: '', key_events: [], forbidden: '' });
      } else setSynopsis({ episode_number: ep.episode_number, synopsis: '', key_events: [], forbidden: '' });
      setHooks(hooksRes.ok ? (await hooksRes.json()).hooks ?? [] : []);
      if (autoR.ok) {
        const autoJ = await autoR.json();
        if (autoJ?.autoWriting) {
          setAutoWriting((prev) => ({ ...prev, ...(autoJ.autoWriting as AutoWritingConfig) }));
        }
      }
      if (contractRes.ok) {
        const contractJson = await contractRes.json();
        const contract = contractJson?.contract;
        if (contract) {
          setTransitionContract({
            sourceEpisodeNumber: Number(contract.source_episode_number || ep.episode_number),
            targetEpisodeNumber: Number(contract.target_episode_number || ep.episode_number + 1),
            anchor1: String(contract.anchor_1 || ''),
            anchor2: String(contract.anchor_2 || ''),
            anchor3: String(contract.anchor_3 || ''),
            openingGuardrail: String(
              contract.opening_guardrail ||
                '다음 화 시작 400자 이내에 직전 화 마지막 장면의 감정/행동 결과를 즉시 이어서 시작한다.'
            ),
          });
        } else {
          setTransitionContract(buildDefaultTransitionContract(ep.episode_number));
        }
      } else {
        setTransitionContract(buildDefaultTransitionContract(ep.episode_number));
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed.'); } finally { setLoading(false); }
  }, [episodeId, projectId]);
  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => ({
    world: world ? [world.world_name, world.time_period, world.geography].filter(Boolean).join(' · ') : 'No world setup yet.',
    synopsis: synopsis?.synopsis?.trim() || 'No synopsis yet.',
    chars: chars.slice(0, 6).map((x) => x.name).filter(Boolean).join(', ') || 'No characters.',
    hooks: hooks.slice(0, 5).map((x) => x.summary).filter(Boolean).join(', ') || 'No hooks.',
  }), [chars, hooks, synopsis?.synopsis, world]);

  const saveSetup = useCallback(async () => {
    if (!episode || !synopsis) return;
    setSetupSaving(true); setError(null); setStatus('');
    try {
      const worldPayload = { world_name: world?.world_name ?? '', time_period: world?.time_period ?? '', geography: world?.geography ?? '', absolute_rules: world?.absolute_rules ?? [], forbidden_elements: world?.forbidden_elements ?? [] };
      const wRes = await fetch(`/api/projects/${projectId}/world-bible`, { method: world?.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(worldPayload) });
      if (!wRes.ok) throw new Error('World save failed.');
      const synPayload = { title, synopsis: synopsis.synopsis, key_events: synopsis.key_events ?? [], forbidden: synopsis.forbidden ?? '' };
      const synRes = synopsis.id
        ? await fetch(`/api/projects/${projectId}/story-bible/${episode.episode_number}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(synPayload) })
        : await fetch(`/api/projects/${projectId}/story-bible`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ episode_number: episode.episode_number, ...synPayload }) });
      if (!synRes.ok) throw new Error('Synopsis save failed.');
      for (const c of chars) {
        if (!c.name.trim()) continue;
        const url = c.id ? `/api/projects/${projectId}/characters/${c.id}` : `/api/projects/${projectId}/characters`;
        const method = c.id ? 'PATCH' : 'POST';
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: c.name, role: c.role, personality: c.personality }) });
        if (!r.ok) throw new Error(`Character save failed: ${c.name}`);
      }
      for (const h of hooks) {
        if (!h.summary.trim()) continue;
        const url = h.id ? `/api/projects/${projectId}/hooks/${h.id}` : `/api/projects/${projectId}/hooks`;
        const method = h.id ? 'PATCH' : 'POST';
        const body = h.id
          ? { summary: h.summary, detail: h.detail, status: h.status ?? 'open', importance: h.importance ?? 5 }
          : { summary: h.summary, detail: h.detail ?? '', hook_type: h.hook_type ?? 'foreshadowing', importance: h.importance ?? 5, created_in_episode_number: episode.episode_number, status: h.status ?? 'open' };
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) throw new Error(`Hook save failed: ${h.summary}`);
      }
      if (transitionContract) {
        const contractRes = await fetch(`/api/projects/${projectId}/transition-contracts`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceEpisodeNumber: transitionContract.sourceEpisodeNumber,
            targetEpisodeNumber: transitionContract.targetEpisodeNumber,
            anchor1: transitionContract.anchor1,
            anchor2: transitionContract.anchor2,
            anchor3: transitionContract.anchor3,
            openingGuardrail: transitionContract.openingGuardrail,
          }),
        });
        if (!contractRes.ok) throw new Error('Transition contract save failed.');
      }
      setStatus('Setup saved.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Setup save failed.'); } finally { setSetupSaving(false); }
  }, [chars, episode, hooks, load, projectId, synopsis, title, transitionContract, world]);

  const validate = useCallback(async (target: string) => {
    if (!episode || target.trim().length < 100) return;
    setFlow('validating'); setStatus('OpenAI validator running...'); setError(null);
    try {
      const r = await fetch('/api/ai/validate-prose', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, content: target, episodeNumber: episode.episode_number }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Validation failed.'); }
      const j = await r.json();
      const result = j.result as { overallScore: number; passed: boolean; summary: string; checks: Check[]; suggestions: string[]; };
      setReport({ passed: Boolean(result?.passed), overallScore: Number(result?.overallScore ?? 0), summary: result?.summary || '', checks: Array.isArray(result?.checks) ? result.checks : [], suggestions: Array.isArray(result?.suggestions) ? result.suggestions : [], model: j.model || 'gpt-4o', stale: false });
      setFlow(result?.passed ? 'validation_passed' : 'validation_failed');
      setStatus(result?.passed ? 'Validation PASS' : 'Validation FAIL');
    } catch (e) { setError(e instanceof Error ? e.message : 'Validation failed.'); setFlow('drafted'); setStatus(''); }
  }, [episode, projectId]);

  const generate = useCallback(async (
    instruction: string,
    options?: { forceContinue?: boolean; forceFresh?: boolean }
  ) => {
    if (!episode) return;
    abortRef.current?.abort();
    const c = new AbortController();
    abortRef.current = c;
    const previousContentSnapshot = content;
    const existingDraft = previousContentSnapshot.trim();
    const continueFromExisting =
      !options?.forceFresh &&
      (existingDraft.length >= 120 || (Boolean(options?.forceContinue) && existingDraft.length > 0));
    let streamCompleted = false;
    let receivedStreamText = false;
    setFlow('drafting');
    setStatus(continueFromExisting ? '기존 원고 이어쓰기 중...' : 'Claude writing...');
    setError(null);
    setReport(null);
    setTraceId(null);
    try {
      const r = await fetch('/api/ai/generate-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          targetEpisodeNumber: episode.episode_number,
          userInstruction: instruction,
          saveToDb: false,
          continueFromExisting,
          existingContent: continueFromExisting ? existingDraft : undefined,
          forceContinue: Boolean(options?.forceContinue && existingDraft.length > 0),
        }),
        signal: c.signal,
      });
      if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Generation failed.'); }
      const rd = r.body.getReader(); const dec = new TextDecoder();
      let buf = '';
      let txt = continueFromExisting ? `${existingDraft}\n\n` : '';
      let full = '';
      let suppressStreamingAfterRetry = false;
      while (true) {
        const { done, value } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split('\n\n'); buf = blocks.pop() || '';
        for (const b of blocks) {
          if (!b.startsWith('data:')) continue;
          const p = b.replace(/^data:\s*/, '').trim(); if (!p || p === '[DONE]') continue;
          const m = parse(p); if (!m) continue;
          if (m.type === 'heartbeat') { setStatus(String(m.message || 'Working...')); continue; }
          if (m.type === 'stage') {
            const ev = m.stageEvent as { stage?: string; status?: string; summary?: string } | undefined;
            if (ev?.summary) setStatus(ev.summary);
            // Auto-retry가 시작되면 화면 본문은 유지하고,
            // 재작성 스트림은 최종 complete 시점에만 반영한다.
            if (ev?.stage === 'retrying' && ev?.status === 'running') {
              suppressStreamingAfterRetry = true;
            }
            continue;
          }
          if (m.type === 'text') {
            const chunk = String(m.content || '');
            txt += chunk;
            if (chunk.trim().length > 0) receivedStreamText = true;
            if (!suppressStreamingAfterRetry) {
              setContent(clean(txt));
            }
            continue;
          }
          if (m.type === 'complete') { full = String(m.fullText || txt); streamCompleted = true; continue; }
          if (m.type === 'metadata') { if (m.traceId) setTraceId(String(m.traceId)); continue; }
          if (m.type === 'error') throw new Error(String(m.message || 'Generation error.'));
        }
      }
      const finalText = clean(full || txt);
      setContent(finalText); setOriginal(finalText); setFlow('drafted'); setStatus('Draft completed. Validating...');
      await validate(finalText);
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') { setStatus('Generation stopped.'); setFlow(content.trim() ? 'drafted' : 'idle'); return; }
      let nextFlow: Flow = content.trim() ? 'drafted' : 'idle';
      if (!streamCompleted && receivedStreamText) {
        setContent(previousContentSnapshot);
        setStatus('생성이 중간에 끊겨 직전 원고로 복구했습니다. 다시 시도해주세요.');
        nextFlow = previousContentSnapshot.trim() ? 'drafted' : 'idle';
      }
      setError(e instanceof Error ? e.message : 'Generation failed.'); setFlow(nextFlow);
    }
  }, [content, episode, projectId, validate]);

  const saveDraft = useCallback(async () => {
    if (!episode) return;
    // 에디터에서 직접 현재 값을 가져와 상태 동기화 문제 방지
    const currentContent = editorRef.current?.value ?? content;
    setFlow('saving'); setError(null); setStatus('');
    try {
      const r = await fetch(`/api/projects/${projectId}/episodes/${episode.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content: currentContent, originalContent: original ?? currentContent, status: 'draft' }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Save failed.'); }
      const j = await r.json(); const ep = j.episode as Episode;
      setEpisode(ep); setContent(ep.content ?? ''); setOriginal(ep.original_content ?? original ?? currentContent); setFlow('saved'); setStatus('Saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed.'); setFlow('drafted'); }
  }, [content, episode, original, projectId, title]);

  const adoptAndLearn = useCallback(async () => {
    if (!episode) return;
    // 에디터에서 직접 현재 값을 가져와 상태 동기화 문제 방지
    const currentContent = editorRef.current?.value ?? content;
    if (!currentContent.trim()) {
      setError('저장할 본문이 없습니다.');
      return;
    }
    setFlow('saving'); setError(null);
    try {
      const a = await fetch(`/api/projects/${projectId}/episodes/${episode.id}/adopt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content: currentContent,
          originalContent: original ?? currentContent,
        }),
      });
      if (!a.ok) { const j = await a.json().catch(() => ({})); throw new Error(j.error || 'Adopt failed.'); }
      setFlow('saved'); setStatus('Adopted. Feedback learning started.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Adopt failed.'); setFlow('drafted'); }
  }, [content, episode, load, original, projectId, title]);

  const persistFeedbackAsDNA = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    try {
      await fetch(`/api/projects/${projectId}/style-dna`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceName: `PD Feedback ${new Date().toISOString().slice(0, 16)}`,
          sourceType: 'pd_feedback',
          favorPatterns: [trimmed],
          confidence: 0.62,
        }),
      });
    } catch (error) {
      console.warn('[EpisodeEditorV2] style-dna feedback save skipped:', error);
    }
  }, [projectId]);

  const runPartialRewrite = useCallback(async (
    rangeStart: number,
    rangeEnd: number,
    instructionText: string,
    scopeLabel: string
  ) => {
    const target = content.slice(rangeStart, rangeEnd);
    if (!target.trim()) {
      setError('No editable range found for feedback.');
      return;
    }

    setPartialBusy(true);
    setError(null);
    setStatus(`${scopeLabel} partial rewrite in progress...`);

    try {
      const beforeSelection = content.slice(Math.max(0, rangeStart - 500), rangeStart);
      const afterSelection = content.slice(rangeEnd, Math.min(content.length, rangeEnd + 500));

      const res = await fetch('/api/ai/partial-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: target,
          instruction: instructionText.trim(),
          context: { beforeSelection, afterSelection },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || 'Partial rewrite failed.');
      }

      const payload = await res.json();
      const rewritten = String(payload.rewrittenText || '').trim();
      if (!rewritten) {
        throw new Error('Partial rewrite returned empty text.');
      }

      const nextContent = content.slice(0, rangeStart) + rewritten + content.slice(rangeEnd);
      setContent(nextContent);
      setSelection({ start: rangeStart, end: rangeStart + rewritten.length });

      if (report) setReport({ ...report, stale: true });
      setFlow('revising');
      setStatus(`${scopeLabel} partial rewrite complete. Run validation next.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Partial rewrite failed.');
    } finally {
      setPartialBusy(false);
    }
  }, [content, report]);

  const rewriteWithFeedback = useCallback(async () => {
    if (!feedback.trim()) { setError('Write feedback first.'); return; }
    await persistFeedbackAsDNA(feedback);

    const instruction = [
      pd.trim(),
      '[Full Rewrite Request]',
      feedback.trim(),
      'Rewrite the whole episode from the beginning.',
      'Use world/synopsis/characters/PD instruction and apply feedback.',
      'Do not continue from existing draft.',
      'Do not partially edit. Produce one coherent full draft.',
    ]
      .filter(Boolean)
      .join('\n\n');

    await generate(instruction, { forceFresh: true });
  }, [feedback, generate, pd, persistFeedbackAsDNA]);

  const continueWriting = useCallback(async () => {
    if (!content.trim()) {
      setError('이어쓰기할 본문이 없습니다. 먼저 초안을 작성해 주세요.');
      return;
    }

    const continuationInstruction = [
      pd.trim(),
      '[Continuation Request]',
      feedback.trim(),
      'Inspect current draft and continue from the ending.',
      'Do not rewrite previous paragraphs.',
      'Append only new continuation paragraphs.',
    ]
      .filter(Boolean)
      .join('\n\n');

    await generate(continuationInstruction, { forceContinue: true });
  }, [content, feedback, generate, pd]);

  const startDraft = useCallback(async () => {
    await generate(pd.trim() || 'Write this episode using current setup.');
  }, [generate, pd]);

  const saveAutoWritingConfig = useCallback(async (patch?: Partial<AutoWritingConfig>) => {
    setAutoBusy(true);
    setError(null);
    try {
      const payload = {
        enabled: patch?.enabled ?? autoWriting.enabled,
        startTime: patch?.startTime ?? autoWriting.startTime,
        runsPerDay: patch?.runsPerDay ?? autoWriting.runsPerDay,
        timezone: patch?.timezone ?? autoWriting.timezone,
        instructionTemplate: patch?.instructionTemplate ?? autoWriting.instructionTemplate,
      };
      const res = await fetch(`/api/projects/${projectId}/auto-writing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save auto writing config.');
      }
      const body = await res.json();
      if (body?.autoWriting) {
        setAutoWriting(body.autoWriting as AutoWritingConfig);
      }
      setStatus('자동작성 설정이 저장되었습니다.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save auto writing config.');
    } finally {
      setAutoBusy(false);
    }
  }, [autoWriting.enabled, autoWriting.instructionTemplate, autoWriting.runsPerDay, autoWriting.startTime, autoWriting.timezone, projectId]);

  const toggleAutoWriting = useCallback(async () => {
    await saveAutoWritingConfig({ enabled: !autoWriting.enabled });
  }, [autoWriting.enabled, saveAutoWritingConfig]);

  const runAutoWritingNow = useCallback(async () => {
    setAutoBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/auto-writing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_now' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || '자동작성 실행에 실패했습니다.');
      }
      if (body?.autoWriting) {
        setAutoWriting(body.autoWriting as AutoWritingConfig);
      }
      if (body?.result?.ok) {
        const epNum = body?.result?.episodeNumber;
        setStatus(epNum ? `자동작성 완료: ${epNum}화 초안이 생성되었습니다.` : '자동작성이 완료되었습니다.');
        await load();
      } else {
        const reason = body?.result?.reason || '자동작성 실행 조건을 만족하지 못했습니다.';
        setStatus(`자동작성 보류: ${reason}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '자동작성 실행 실패');
    } finally {
      setAutoBusy(false);
    }
  }, [load, projectId]);

  const selectedText = useMemo(() => {
    if (selection.end <= selection.start) return '';
    return content.slice(selection.start, selection.end);
  }, [content, selection.end, selection.start]);

  const syncSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;

    setSelection({
      start: el.selectionStart ?? 0,
      end: el.selectionEnd ?? 0,
    });
  }, []);

  const rewriteSelectedSegment = useCallback(async () => {
    if (!selectedText.trim()) {
      setError('본문에서 재집필할 구간을 먼저 선택해주세요.');
      return;
    }

    if (!feedback.trim()) {
      setError('부분 재집필 지시사항을 입력해주세요.');
      return;
    }

    setPartialBusy(true);
    setError(null);
    setStatus('선택 구간 재집필 중...');

    try {
      const beforeSelection = content.slice(Math.max(0, selection.start - 500), selection.start);
      const afterSelection = content.slice(selection.end, Math.min(content.length, selection.end + 500));

      const res = await fetch('/api/ai/partial-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: selectedText,
          instruction: feedback.trim(),
          context: {
            beforeSelection,
            afterSelection,
          },
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || '부분 재집필에 실패했습니다.');
      }

      const payload = await res.json();
      const rewritten = String(payload.rewrittenText || '').trim();
      if (!rewritten) {
        throw new Error('부분 재집필 결과가 비어 있습니다.');
      }

      const nextContent =
        content.slice(0, selection.start) + rewritten + content.slice(selection.end);

      setContent(nextContent);
      setSelection({
        start: selection.start,
        end: selection.start + rewritten.length,
      });

      if (report) setReport({ ...report, stale: true });
      setFlow('revising');
      setStatus('선택 구간 재집필 완료. 재검수를 진행해주세요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '부분 재집필 실패');
    } finally {
      setPartialBusy(false);
    }
  }, [content, feedback, report, selectedText, selection.end, selection.start]);

  const rewriteSelectedSegmentSmart = useCallback(async () => {
    if (!selectedText.trim()) {
      setError('본문에서 부분 수정할 구간을 먼저 선택해 주세요.');
      return;
    }

    if (!feedback.trim()) {
      setError('부분 수정 지시사항을 입력해 주세요.');
      return;
    }

    await persistFeedbackAsDNA(feedback);
    await runPartialRewrite(selection.start, selection.end, feedback, 'Selected range');
  }, [feedback, persistFeedbackAsDNA, runPartialRewrite, selectedText, selection.end, selection.start]);

  const step = (label: string, state: 'done' | 'running' | 'waiting') => (
    <div className={`rounded-xl border px-3 py-3 text-sm ${state === 'running' ? 'border-indigo-500 bg-indigo-500/20 text-indigo-50' : state === 'done' ? 'border-emerald-600 bg-emerald-600/15 text-emerald-100' : 'border-slate-800 bg-slate-900 text-slate-400'}`}>
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-xs">{state.toUpperCase()}</div>
    </div>
  );

  if (loading || !episode || !synopsis) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">Loading editor...</div>;
  const busy = flow === 'drafting' || flow === 'validating' || flow === 'saving' || partialBusy;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1800px] px-5 py-5">
        <header className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/90 px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href={`/projects/${projectId}/episodes`} className="text-sm text-slate-400 hover:text-slate-200">에피소드 목록</Link>
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-100">Claude 전담 집필</span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">OpenAI 검수</span>
            </div>
            <div className="text-xs text-slate-400">trace: {traceId ?? '-'}</div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-[260px] flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-semibold outline-none focus:border-indigo-500" />
            <div className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">Chars {content.length.toLocaleString()}</div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setTab('workspace')} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'workspace' ? 'bg-indigo-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>집필 탭</button>
            <button onClick={() => setTab('setup')} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'setup' ? 'bg-indigo-500 text-black' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>기획 탭</button>
          </div>
        </header>

        {error && <div className="mb-4 rounded-xl border border-rose-700 bg-rose-900/40 px-4 py-3 text-sm text-rose-100">{error}</div>}
        {status && <div className="mb-4 rounded-xl border border-indigo-700 bg-indigo-900/30 px-4 py-3 text-sm text-indigo-100">{status}</div>}

        {tab === 'setup' && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">기획 통합 편집 (세계관 / 캐릭터 / 시놉시스 / 떡밥)</h2>
              <button onClick={() => void saveSetup()} disabled={setupSaving} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">{setupSaving ? '저장 중...' : '기획 저장'}</button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="mb-2 text-sm font-semibold">세계관</h3>
                <input value={world?.world_name ?? ''} onChange={(e) => setWorld((p) => ({ id: p?.id, world_name: e.target.value, time_period: p?.time_period ?? '', geography: p?.geography ?? '', absolute_rules: p?.absolute_rules ?? [], forbidden_elements: p?.forbidden_elements ?? [] }))} placeholder="World name" className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                <input value={world?.time_period ?? ''} onChange={(e) => setWorld((p) => ({ id: p?.id, world_name: p?.world_name ?? '', time_period: e.target.value, geography: p?.geography ?? '', absolute_rules: p?.absolute_rules ?? [], forbidden_elements: p?.forbidden_elements ?? [] }))} placeholder="Time period" className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                <textarea value={world?.geography ?? ''} onChange={(e) => setWorld((p) => ({ id: p?.id, world_name: p?.world_name ?? '', time_period: p?.time_period ?? '', geography: e.target.value, absolute_rules: p?.absolute_rules ?? [], forbidden_elements: p?.forbidden_elements ?? [] }))} placeholder="Geography" rows={4} className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                <textarea value={(world?.absolute_rules ?? []).join('\n')} onChange={(e) => setWorld((p) => ({ id: p?.id, world_name: p?.world_name ?? '', time_period: p?.time_period ?? '', geography: p?.geography ?? '', absolute_rules: lines(e.target.value), forbidden_elements: p?.forbidden_elements ?? [] }))} placeholder="Absolute rules (line by line)" rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="mb-2 text-sm font-semibold">이번 화 목표</h3>
                <textarea value={synopsis.synopsis} onChange={(e) => setSynopsis((p) => p ? { ...p, synopsis: e.target.value } : p)} placeholder="Synopsis" rows={6} className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                <textarea value={(synopsis.key_events ?? []).join('\n')} onChange={(e) => setSynopsis((p) => p ? { ...p, key_events: lines(e.target.value) } : p)} placeholder="Must include beats" rows={4} className="mb-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                <textarea value={synopsis.forbidden ?? ''} onChange={(e) => setSynopsis((p) => p ? { ...p, forbidden: e.target.value } : p)} placeholder="Forbidden elements" rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <h3 className="mb-2 text-sm font-semibold">다음 화 시작 앵커 (연결 계약)</h3>
              <p className="mb-3 text-xs text-slate-400">
                다음 회차 도입부가 현재 회차 엔딩과 자연스럽게 연결되도록 핵심 앵커 3개를 지정합니다.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <textarea
                  value={transitionContract?.anchor1 ?? ''}
                  onChange={(e) =>
                    setTransitionContract((prev) => ({
                      ...(prev ?? buildDefaultTransitionContract(episode.episode_number)),
                      anchor1: e.target.value,
                    }))
                  }
                  placeholder="Anchor 1 (직전 엔딩의 관찰/상황)"
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                />
                <textarea
                  value={transitionContract?.anchor2 ?? ''}
                  onChange={(e) =>
                    setTransitionContract((prev) => ({
                      ...(prev ?? buildDefaultTransitionContract(episode.episode_number)),
                      anchor2: e.target.value,
                    }))
                  }
                  placeholder="Anchor 2 (감정/관계 변화)"
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                />
                <textarea
                  value={transitionContract?.anchor3 ?? ''}
                  onChange={(e) =>
                    setTransitionContract((prev) => ({
                      ...(prev ?? buildDefaultTransitionContract(episode.episode_number)),
                      anchor3: e.target.value,
                    }))
                  }
                  placeholder="Anchor 3 (다음 화 첫 행동의 트리거)"
                  rows={4}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
                />
              </div>
              <textarea
                value={transitionContract?.openingGuardrail ?? ''}
                onChange={(e) =>
                  setTransitionContract((prev) => ({
                    ...(prev ?? buildDefaultTransitionContract(episode.episode_number)),
                    openingGuardrail: e.target.value,
                  }))
                }
                placeholder="Opening guardrail"
                rows={3}
                className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">캐릭터</h3><button onClick={() => setChars((p) => [...p, { name: '', role: 'supporting', personality: '' }])} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">+ 추가</button></div>
              {chars.map((c, i) => (
                <div key={`${c.id ?? 'new'}-${i}`} className="mb-2 grid gap-2 md:grid-cols-3">
                  <input value={c.name} onChange={(e) => setChars((p) => p.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} placeholder="Name" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                  <input value={c.role ?? ''} onChange={(e) => setChars((p) => p.map((x, idx) => idx === i ? { ...x, role: e.target.value } : x))} placeholder="Role" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                  <input value={c.personality ?? ''} onChange={(e) => setChars((p) => p.map((x, idx) => idx === i ? { ...x, personality: e.target.value } : x))} placeholder="Personality" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">떡밥</h3><button onClick={() => setHooks((p) => [...p, { summary: '', detail: '', status: 'open', importance: 5, hook_type: 'foreshadowing' }])} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800">+ 추가</button></div>
              {hooks.map((h, i) => (
                <div key={`${h.id ?? 'new'}-${i}`} className="mb-2 grid gap-2 md:grid-cols-[2fr_2fr_120px]">
                  <input value={h.summary} onChange={(e) => setHooks((p) => p.map((x, idx) => idx === i ? { ...x, summary: e.target.value } : x))} placeholder="Summary" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                  <input value={h.detail ?? ''} onChange={(e) => setHooks((p) => p.map((x, idx) => idx === i ? { ...x, detail: e.target.value } : x))} placeholder="Detail" className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none" />
                  <select value={h.status ?? 'open'} onChange={(e) => setHooks((p) => p.map((x, idx) => idx === i ? { ...x, status: e.target.value } : x))} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none"><option value="open">open</option><option value="hinted">hinted</option><option value="escalated">escalated</option><option value="partially_resolved">partially_resolved</option><option value="resolved">resolved</option></select>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'workspace' && (
          <section>
            <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-200">자동작성 스케줄</h3>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${autoWriting.enabled ? 'bg-emerald-500/20 text-emerald-200' : 'bg-slate-800 text-slate-400'}`}>
                  {autoWriting.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-xs text-slate-400">
                  시작 시간
                  <input
                    type="time"
                    value={autoWriting.startTime}
                    onChange={(e) => setAutoWriting((prev) => ({ ...prev, startTime: e.target.value || '09:00' }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-200 outline-none"
                  />
                </label>
                <label className="text-xs text-slate-400">
                  일일 횟수
                  <select
                    value={autoWriting.runsPerDay}
                    onChange={(e) => setAutoWriting((prev) => ({ ...prev, runsPerDay: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-200 outline-none"
                  >
                    <option value={1}>1회</option>
                    <option value={2}>2회</option>
                    <option value={3}>3회</option>
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  타임존
                  <input
                    value={autoWriting.timezone}
                    onChange={(e) => setAutoWriting((prev) => ({ ...prev, timezone: e.target.value || 'Asia/Seoul' }))}
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-200 outline-none"
                  />
                </label>
              </div>
              <textarea
                value={autoWriting.instructionTemplate}
                onChange={(e) => setAutoWriting((prev) => ({ ...prev, instructionTemplate: e.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-slate-200 outline-none"
                placeholder="자동작성 기본 지시문"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => void saveAutoWritingConfig()} disabled={busy || autoBusy} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">시간설정 저장</button>
                <button onClick={() => void toggleAutoWriting()} disabled={busy || autoBusy} className={`rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-50 ${autoWriting.enabled ? 'bg-rose-500/80 text-white' : 'bg-emerald-500 text-black'}`}>
                  {autoWriting.enabled ? '자동작성 중지' : '자동작성 시작'}
                </button>
                <button onClick={() => void runAutoWritingNow()} disabled={busy || autoBusy} className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">지금 1회 실행</button>
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                다음 실행: {autoWriting.nextRunAt ? new Date(autoWriting.nextRunAt).toLocaleString() : '-'}
                {' · '}
                마지막 실행: {autoWriting.lastRunAt ? new Date(autoWriting.lastRunAt).toLocaleString() : '-'}
              </div>
            </div>
            <div className="mb-4 grid gap-2 md:grid-cols-4">
              {step('STEP 1 기획', synopsis.synopsis.trim() || world?.world_name ? 'done' : 'waiting')}
              {step('STEP 2 집필 (Claude)', flow === 'drafting' ? 'running' : content.trim() ? 'done' : 'waiting')}
              {step('STEP 3 검수 (OpenAI)', flow === 'validating' ? 'running' : report ? 'done' : 'waiting')}
              {step('STEP 4 피드백 학습', flow === 'saving' ? 'running' : flow === 'saved' ? 'done' : 'waiting')}
            </div>
            <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
              <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                <h3 className="mb-2 text-sm font-semibold">Setup Summary</h3>
                <div className="space-y-3 text-sm text-slate-300">
                  <div><div className="text-xs text-slate-500">World</div><div>{summary.world}</div></div>
                  <div><div className="text-xs text-slate-500">Synopsis</div><div>{summary.synopsis}</div></div>
                  <div><div className="text-xs text-slate-500">Characters</div><div>{summary.chars}</div></div>
                  <div><div className="text-xs text-slate-500">Hooks</div><div>{summary.hooks}</div></div>
                </div>
              </aside>
              <main className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-2 text-sm font-semibold">PD 지시사항</h3>
                  <textarea value={pd} onChange={(e) => setPd(e.target.value)} rows={4} placeholder="Direction for this episode" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => void startDraft()} disabled={busy} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">{flow === 'drafting' ? '집필 중...' : 'AI 생성'}</button>
                    <button onClick={() => void validate(content)} disabled={busy || content.trim().length < 100} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">재검수</button>
                    <button onClick={() => { abortRef.current?.abort(); setFlow(content.trim() ? 'drafted' : 'idle'); }} disabled={flow !== 'drafting'} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">중단</button>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">본문 원고 (Claude Draft)</h3>
                    <button
                      onClick={() => {
                        const formatted = formatForNaverMobile(content);
                        setContent(formatted);
                        if (report) setReport({ ...report, stale: true });
                        setStatus('네이버 모바일 포맷 적용 완료');
                      }}
                      disabled={busy || !content.trim()}
                      className="rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                    >
                      네이버 포맷
                    </button>
                  </div>
                  <textarea
                    ref={editorRef}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      if (report) setReport({ ...report, stale: true });
                      if (flow === 'validation_passed' || flow === 'validation_failed') setFlow('revising');
                    }}
                    onSelect={syncSelection}
                    onKeyUp={syncSelection}
                    onMouseUp={syncSelection}
                    readOnly={episode.status === 'published'}
                    className="min-h-[760px] w-full rounded-xl border border-slate-700 bg-slate-950 px-6 py-6 text-[16px] leading-[2.4] tracking-wide outline-none whitespace-pre-wrap font-[inherit]"
                    style={{ wordBreak: 'keep-all', overflowWrap: 'break-word' }}
                  />
                  <div className="mt-2 text-xs text-slate-400">
                    {selectedText.trim().length > 0
                      ? `선택 구간: ${selectedText.length.toLocaleString()}자`
                      : '부분 재집필은 본문에서 구간을 선택한 뒤 사용하세요.'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-2 text-sm font-semibold">피드백 & 학습</h3>
                  <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder='Example: "Make dialogue more cheeky", "Expand combat details"' className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => void rewriteWithFeedback()} disabled={busy || !feedback.trim()} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">다시써 (피드백반영)</button>
                    <button onClick={() => void continueWriting()} disabled={busy || !content.trim()} className="rounded-lg border border-amber-500/70 px-4 py-2 text-sm font-semibold text-amber-200 disabled:opacity-50">이어쓰기</button>
                    <button onClick={() => void saveDraft()} disabled={busy} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">임시저장</button>
                    <button onClick={() => void adoptAndLearn()} disabled={busy || !content.trim()} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60">채택 및 학습</button>
                  </div>
                </div>
              </main>
              <aside className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <h3 className="mb-2 text-sm font-semibold">검수 리포트</h3>
                  {!report ? <div className="text-sm text-slate-400">QA report appears after drafting.</div> : (
                    <div className="space-y-3">
                      <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${report.passed ? 'bg-emerald-500/20 text-emerald-100' : 'bg-amber-500/20 text-amber-100'}`}>{report.passed ? 'PASS' : 'FAIL'} · {report.overallScore}{report.stale ? ' (stale)' : ''}</div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">{report.summary}</div>
                      <div className="space-y-2">
                        {report.checks.map((c) => (
                          <div key={c.id} className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-3">
                            <div className="flex items-center justify-between text-sm"><span className="font-medium">{c.label}</span><span className={c.passed ? 'text-emerald-300' : 'text-amber-300'}>{c.passed ? 'PASS' : 'FAIL'}</span></div>
                            <div className="mt-1 text-xs text-slate-300">{c.comment}</div>
                          </div>
                        ))}
                      </div>
                      {report.suggestions.length > 0 && <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="mb-1 text-xs text-slate-500">Suggestions</div><ul className="space-y-1 text-sm text-slate-300">{report.suggestions.map((s) => <li key={s}>- {s}</li>)}</ul></div>}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
                  <div className="mb-1 text-slate-200">Execution Meta</div>
                  <div>Writer: Claude Sonnet 4</div>
                  <div>Validator: {report?.model || '-'}</div>
                  <div>Mode: claude_legacy fixed</div>
                </div>
              </aside>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
