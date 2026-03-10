import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  SlidingWindowContext,
  EpisodeLogSummary,
  CharacterCurrentState,
  UnresolvedHook,
  WritingPreference,
  LongTermMemoryResult,
  TimelineEvent,
  CurrentArcSummary,
  EpisodeSynopsis,
} from '@/types/memory';

/**
 * 슬라이딩 윈도우 컨텍스트 빌더
 *
 * AI에게 전달할 모든 컨텍스트를 조합하여 반환합니다.
 * - World Bible (절대 규칙)
 * - 직전 N개 에피소드 로그
 * - 직전 회차 마지막 500자 (문맥 연결)
 * - 현재 캐릭터 상태
 * - 미해결 떡밥
 * - 학습된 문체 선호도
 * - (선택) 장기 기억 검색 결과
 */
export async function buildSlidingWindowContext(
  projectId: string,
  targetEpisodeNumber: number,
  options: {
    windowSize?: number;
    longTermSearchQueries?: string[];
    includeWritingPreferences?: boolean;
    includeTimelineEvents?: boolean;
    includeSynopses?: boolean;
  } = {}
): Promise<SlidingWindowContext> {
  const {
    windowSize = 3,
    longTermSearchQueries = [],
    includeWritingPreferences = true,
    includeTimelineEvents = true,
    includeSynopses = true,
  } = options;

  const supabase = await createServerSupabaseClient();

  // 병렬로 모든 컨텍스트 데이터 조회
  const [
    worldBibleResult,
    recentLogsResult,
    charactersResult,
    unresolvedHooksResult,
    writingMemoriesResult,
    timelineEventsResult,
    previousEpisodeResult,
    synopsesResult,
  ] = await Promise.all([
    // 1. World Bible 조회
    supabase
      .from('world_bibles')
      .select('*')
      .eq('project_id', projectId)
      .single(),

    // 2. 슬라이딩 윈도우 로그 조회 (DB 함수 사용)
    supabase.rpc('get_sliding_window_context', {
      p_project_id: projectId,
      p_target_episode_number: targetEpisodeNumber,
      p_window_size: windowSize,
    }),

    // 3. 활성 캐릭터 조회 (살아있는 캐릭터 + 기본 정보)
    supabase
      .from('characters')
      .select('id, name, role, is_alive, current_location, emotional_state, injuries, possessed_items, personality, backstory, speech_pattern, appearance, goals')
      .eq('project_id', projectId)
      .eq('is_alive', true),

    // 4. 미해결 떡밥 조회 (DB 함수 사용)
    supabase.rpc('get_unresolved_hooks', {
      p_project_id: projectId,
      p_limit: 10,
    }),

    // 5. 문체 선호도 조회 (높은 신뢰도만)
    includeWritingPreferences
      ? supabase
          .from('writing_memories')
          .select('feedback_type, preference_summary, avoid_patterns, favor_patterns, confidence')
          .eq('project_id', projectId)
          .eq('is_active', true)
          .gte('confidence', 0.6)
          .order('confidence', { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),

    // 6. 타임라인 이벤트 조회 (현재 회차에 해당하는 이벤트)
    includeTimelineEvents
      ? supabase.rpc('get_active_timeline_events', {
          p_project_id: projectId,
          p_episode_number: targetEpisodeNumber,
        })
      : Promise.resolve({ data: [], error: null }),

    // 7. ★★★ 직전 회차 에피소드 본문 조회 (이어쓰기용) ★★★
    // 2화 이상 생성 시 1화의 본문을 직접 가져와야 완벽한 이어쓰기 가능
    targetEpisodeNumber > 1
      ? supabase
          .from('episodes')
          .select('content, episode_number')
          .eq('project_id', projectId)
          .eq('episode_number', targetEpisodeNumber - 1)
          .single()
      : Promise.resolve({ data: null, error: null }),

    // 8. ★★★ 에피소드 시놉시스 조회 (Story Bible) ★★★
    // 테이블이 없을 수 있으므로 에러 무시
    includeSynopses
      ? fetchEpisodeSynopses(supabase, projectId, targetEpisodeNumber)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // 에러 처리
  if (worldBibleResult.error) {
    throw new Error(`World Bible 조회 실패: ${worldBibleResult.error.message}`);
  }

  // 장기 기억 검색 (선택적)
  let longTermMemories: LongTermMemoryResult[] = [];
  if (longTermSearchQueries.length > 0) {
    const memoryResults = await Promise.all(
      longTermSearchQueries.map(query =>
        supabase.rpc('search_character_memories', {
          p_project_id: projectId,
          p_search_query: query,
          p_limit: 3,
        })
      )
    );

    longTermMemories = memoryResults
      .flatMap(result => result.data || [])
      .map(row => ({
        characterId: row.character_id,
        characterName: row.character_name,
        memoryType: row.memory_type,
        memorySummary: row.memory_summary,
        sourceEpisodeNumber: row.source_episode_number,
        importance: row.importance,
      }));
  }

  // 컨텍스트 조합
  const recentLogs: EpisodeLogSummary[] = (recentLogsResult.data || []).map(log => ({
    episodeNumber: log.episode_number,
    summary: log.summary,
    last500Chars: log.last_500_chars,
    isFallback: log.is_fallback,
  }));

  const activeCharacters: CharacterCurrentState[] = (charactersResult.data || []).map(char => ({
    id: char.id,
    name: char.name,
    role: char.role,
    isAlive: char.is_alive ?? true,
    currentLocation: char.current_location,
    emotionalState: char.emotional_state,
    injuries: char.injuries || [],
    possessedItems: char.possessed_items || [],
    // 캐릭터 기본 정보 추가
    personality: char.personality,
    backstory: char.backstory,
    speechPattern: char.speech_pattern,
    appearance: char.appearance,
    goals: char.goals || [],
  }));

  const unresolvedHooks: UnresolvedHook[] = (unresolvedHooksResult.data || []).map(hook => ({
    id: hook.id,
    hookType: hook.hook_type,
    summary: hook.summary,
    importance: hook.importance,
    createdInEpisodeNumber: hook.created_in_episode_number,
    keywords: hook.keywords || [],
  }));

  const writingPreferences: WritingPreference[] = (writingMemoriesResult.data || [])
    .filter(mem => mem.feedback_type) // null인 경우 제외
    .map(mem => ({
      feedbackType: mem.feedback_type!,
      preferenceSummary: mem.preference_summary || '',
      avoidPatterns: mem.avoid_patterns || [],
      favorPatterns: mem.favor_patterns || [],
      confidence: mem.confidence ?? 0.5,
    }));

  // 직전 회차의 마지막 500자 추출 (기존 로그 기반)
  const lastSceneAnchor = recentLogs.length > 0 ? recentLogs[0].last500Chars : '';

  // ★★★ 직전 회차 본문에서 마지막 1500자 추출 (이어쓰기 강제용) ★★★
  let previousEpisodeEnding = '';
  if (previousEpisodeResult.data?.content) {
    const fullContent = previousEpisodeResult.data.content;
    // 마지막 1500자 추출 (충분한 컨텍스트 제공)
    previousEpisodeEnding = fullContent.slice(-1500);
    console.log('[SlidingWindowBuilder] 직전 회차 본문 로드됨:', {
      episodeNumber: previousEpisodeResult.data.episode_number,
      totalLength: fullContent.length,
      extractedLength: previousEpisodeEnding.length,
    });
  } else if (targetEpisodeNumber > 1) {
    console.warn('[SlidingWindowBuilder] ⚠️ 직전 회차 본문을 찾을 수 없음! 이어쓰기 품질 저하 가능');
  }

  // 타임라인 이벤트 변환
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeTimelineEvents: TimelineEvent[] = (timelineEventsResult.data || []).map((event: any) => ({
    id: event.id,
    eventName: event.event_name,
    eventType: event.event_type as TimelineEvent['eventType'],
    episodeStart: event.episode_start,
    episodeEnd: event.episode_end,
    location: event.location,
    mainConflict: event.main_conflict,
    objectives: event.objectives || [],
    constraints: event.constraints || [],
    foreshadowingSeeds: event.foreshadowing_seeds || [],
    keyCharacters: event.key_characters || [],
    characterFocus: event.character_focus,
    tone: event.tone,
    pacing: event.pacing as TimelineEvent['pacing'],
    importance: event.importance,
    status: event.status as TimelineEvent['status'],
  }));

  // 현재 아크 요약 계산
  const currentArcSummary = calculateCurrentArcSummary(
    activeTimelineEvents,
    targetEpisodeNumber
  );

  // ★★★ 에피소드 시놉시스 변환 (Story Bible) ★★★
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const episodeSynopses: EpisodeSynopsis[] = (synopsesResult.data || []).map((syn: any) => ({
    episodeNumber: syn.episode_number,
    title: syn.title,
    synopsis: syn.synopsis,
    goals: syn.goals,
    keyEvents: syn.key_events,
    featuredCharacters: syn.featured_characters,
    location: syn.location,
    timeContext: syn.time_context,
    arcName: syn.arc_name,
    arcPosition: syn.arc_position,
    foreshadowing: syn.foreshadowing,
    callbacks: syn.callbacks,
    isCurrent: syn.episode_number === targetEpisodeNumber,
  }));

  if (episodeSynopses.length > 0) {
    console.log('[SlidingWindowBuilder] 시놉시스 로드됨:', {
      count: episodeSynopses.length,
      currentEpisode: targetEpisodeNumber,
      hasCurrentSynopsis: episodeSynopses.some(s => s.isCurrent),
    });
  }

  return {
    worldBible: worldBibleResult.data,
    recentLogs,
    lastSceneAnchor,
    previousEpisodeEnding, // ★★★ 직전 회차 마지막 1500자 (이어쓰기 강제용) ★★★
    activeCharacters,
    unresolvedHooks,
    writingPreferences,
    longTermMemories: longTermMemories.length > 0 ? longTermMemories : undefined,
    activeTimelineEvents: activeTimelineEvents.length > 0 ? activeTimelineEvents : undefined,
    currentArcSummary,
    episodeSynopses: episodeSynopses.length > 0 ? episodeSynopses : undefined,
  };
}

/**
 * 현재 아크 위치 계산
 */
function calculateCurrentArcSummary(
  events: TimelineEvent[],
  currentEpisode: number
): CurrentArcSummary | undefined {
  if (events.length === 0) return undefined;

  // 아크 관련 이벤트 찾기 (arc_start, arc_climax, arc_end)
  const arcEvent = events.find(
    (e) =>
      e.eventType === 'arc_start' ||
      e.eventType === 'arc_climax' ||
      e.eventType === 'arc_end'
  );

  // 아크 이벤트가 없으면 가장 중요한 이벤트로 대체
  const mainEvent = arcEvent || events[0];

  const total = mainEvent.episodeEnd - mainEvent.episodeStart + 1;
  const current = currentEpisode - mainEvent.episodeStart + 1;
  const progressPercentage = Math.min(100, Math.max(0, Math.round((current / total) * 100)));

  // 위치 결정
  let position: CurrentArcSummary['position'];
  if (arcEvent) {
    if (arcEvent.eventType === 'arc_start') position = 'start';
    else if (arcEvent.eventType === 'arc_climax') position = 'climax';
    else if (arcEvent.eventType === 'arc_end') position = 'end';
    else position = 'middle';
  } else {
    if (progressPercentage < 30) position = 'start';
    else if (progressPercentage < 70) position = 'middle';
    else if (progressPercentage < 90) position = 'climax';
    else position = 'end';
  }

  return {
    arcName: mainEvent.eventName,
    position,
    progressPercentage,
    mainDirective: mainEvent.mainConflict || mainEvent.eventName,
  };
}

/**
 * 컨텍스트 직렬화 (토큰 수 최적화)
 *
 * 슬라이딩 윈도우 컨텍스트를 프롬프트에 삽입할 문자열로 변환합니다.
 */
export function serializeContext(context: SlidingWindowContext): string {
  const sections: string[] = [];

  // 1. World Bible
  sections.push(`=== WORLD BIBLE (절대 규칙) ===
세계관: ${context.worldBible.world_name || '미설정'}
시대: ${context.worldBible.time_period || '미설정'}
절대 규칙:
${JSON.stringify(context.worldBible.absolute_rules, null, 2)}
금기 사항: ${context.worldBible.forbidden_elements?.join(', ') || '없음'}`);

  // 2. 직전 회차 요약
  if (context.recentLogs.length > 0) {
    const logSummaries = context.recentLogs
      .reverse() // 오래된 순으로 정렬
      .map(log => `[${log.episodeNumber}화${log.isFallback ? ' (임시)' : ''}] ${log.summary}`)
      .join('\n');
    sections.push(`=== 직전 회차 요약 ===\n${logSummaries}`);
  }

  // 3. 문맥 연결 앵커
  if (context.lastSceneAnchor) {
    sections.push(`=== 직전 회차 마지막 장면 ===
"""
${context.lastSceneAnchor}
"""
이 장면에서 자연스럽게 이어서 시작하세요.`);
  }

  // 4. 캐릭터 현재 상태
  if (context.activeCharacters.length > 0) {
    const charStates = context.activeCharacters
      .map(c => `- ${c.name} (${c.role || '역할 미정'}): 위치=${c.currentLocation || '불명'}, 감정=${c.emotionalState || '보통'}${c.injuries.length > 0 ? `, 부상=[${c.injuries.join(', ')}]` : ''}`)
      .join('\n');
    sections.push(`=== 현재 캐릭터 상태 ===\n${charStates}`);
  }

  // 5. 미해결 떡밥
  if (context.unresolvedHooks.length > 0) {
    const hooks = context.unresolvedHooks
      .map(h => `- [${h.createdInEpisodeNumber}화, 중요도${h.importance}] ${h.summary}`)
      .join('\n');
    sections.push(`=== 미해결 떡밥 (필요시 회수 가능) ===\n${hooks}`);
  }

  // 6. 문체 선호도
  if (context.writingPreferences.length > 0) {
    const prefs = context.writingPreferences
      .map(p => {
        const parts = [p.preferenceSummary];
        if (p.favorPatterns.length > 0) parts.push(`선호: ${p.favorPatterns.join(', ')}`);
        if (p.avoidPatterns.length > 0) parts.push(`회피: ${p.avoidPatterns.join(', ')}`);
        return `- ${parts.filter(Boolean).join(' / ')}`;
      })
      .join('\n');
    sections.push(`=== 학습된 문체 선호도 ===\n${prefs}`);
  }

  // 7. 장기 기억 (검색 결과)
  if (context.longTermMemories && context.longTermMemories.length > 0) {
    const memories = context.longTermMemories
      .map(m => `- [${m.sourceEpisodeNumber || '?'}화] ${m.characterName}: ${m.memorySummary}`)
      .join('\n');
    sections.push(`=== 관련 장기 기억 ===\n${memories}`);
  }

  return sections.join('\n\n');
}

/**
 * 에피소드 시놉시스 조회 헬퍼 함수
 * episode_synopses 테이블이 없을 경우 빈 배열 반환
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchEpisodeSynopses(
  supabase: any,
  projectId: string,
  targetEpisodeNumber: number
): Promise<{ data: unknown[] | null; error: unknown }> {
  try {
    const result = await supabase
      .from('episode_synopses')
      .select('*')
      .eq('project_id', projectId)
      .gte('episode_number', targetEpisodeNumber - 3)
      .lte('episode_number', targetEpisodeNumber + 5)
      .order('episode_number', { ascending: true });

    return result;
  } catch {
    // 테이블이 없거나 에러 발생 시 빈 배열 반환
    console.log('[SlidingWindowBuilder] episode_synopses 테이블 조회 실패 (테이블 없을 수 있음)');
    return { data: [], error: null };
  }
}

// ============================================================================
// v8.4: 다이내믹 컨텍스트 최적화 (Dynamic Context Optimization)
// LLM의 토큰 한계와 집중력 문제를 해결하기 위한 압축 컨텍스트
// ============================================================================

/**
 * 다이내믹 컨텍스트 요약 결과
 */
export interface DynamicContextSummary {
  // 1. 전체 시놉시스 3줄 요약
  overallSynopsis: string;

  // 2. 직전 1~2화 엔딩 (이어쓰기용)
  previousEndings: Array<{
    episodeNumber: number;
    lastParagraphs: string;  // 마지막 500자
  }>;

  // 3. 핵심 캐릭터 상태 (최소 정보)
  coreCharacters: Array<{
    name: string;
    role: string;
    status: string;  // 한 줄 요약
  }>;

  // 4. 즉시 필요한 미해결 떡밥 (중요도 8+ 만)
  urgentHooks: string[];

  // 토큰 절감 효과 추정치
  estimatedTokenReduction: number;
}

/**
 * 슬라이딩 윈도우 컨텍스트를 다이내믹 컨텍스트로 압축
 *
 * 핵심 원칙:
 * 1. 전체 시놉시스 3줄 요약
 * 2. 직전 1~2화 엔딩
 * 3. 현재 PD 지시사항 (별도 전달)
 *
 * @param context 전체 슬라이딩 윈도우 컨텍스트
 * @returns 압축된 다이내믹 컨텍스트
 */
export function buildDynamicContext(context: SlidingWindowContext): DynamicContextSummary {
  // 1. 전체 시놉시스 3줄 요약 생성
  let overallSynopsis = '';

  if (context.episodeSynopses && context.episodeSynopses.length > 0) {
    // 시놉시스가 있는 경우 3줄로 압축
    const synopses = context.episodeSynopses
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .slice(0, 5);

    const currentSyn = synopses.find(s => s.isCurrent);
    const prevSyn = synopses.filter(s => s.episodeNumber < (currentSyn?.episodeNumber || 999)).slice(-2);

    overallSynopsis = [
      prevSyn.length > 0 ? `[이전] ${prevSyn.map(s => s.synopsis.substring(0, 50)).join(' → ')}` : '',
      currentSyn ? `[현재] ${currentSyn.synopsis.substring(0, 100)}` : '',
      currentSyn?.goals?.length ? `[목표] ${currentSyn.goals.slice(0, 2).join(', ')}` : '',
    ].filter(Boolean).join('\n');
  } else if (context.recentLogs && context.recentLogs.length > 0) {
    // 시놉시스가 없으면 로그 요약 사용
    overallSynopsis = context.recentLogs
      .slice(-3)
      .map(log => `[${log.episodeNumber}화] ${log.summary.substring(0, 80)}`)
      .join('\n');
  }

  // 2. 직전 1~2화 엔딩 추출
  const previousEndings: DynamicContextSummary['previousEndings'] = [];

  if (context.previousEpisodeEnding) {
    // 직전 회차 엔딩이 있으면 마지막 500자 사용
    previousEndings.push({
      episodeNumber: context.recentLogs[0]?.episodeNumber || 0,
      lastParagraphs: context.previousEpisodeEnding.slice(-500),
    });
  }

  // 이전 로그에서 last500Chars 추가 (최대 2개)
  if (context.recentLogs) {
    for (const log of context.recentLogs.slice(0, 2)) {
      if (log.last500Chars && !previousEndings.some(e => e.episodeNumber === log.episodeNumber)) {
        previousEndings.push({
          episodeNumber: log.episodeNumber,
          lastParagraphs: log.last500Chars,
        });
      }
    }
  }

  // 3. 핵심 캐릭터 상태 (주인공, 빌런, 주요 조연만)
  const coreCharacters: DynamicContextSummary['coreCharacters'] = [];

  if (context.activeCharacters) {
    const priorityRoles = ['protagonist', 'antagonist', 'supporting'];

    for (const role of priorityRoles) {
      const chars = context.activeCharacters.filter(c => c.role === role);
      for (const char of chars.slice(0, role === 'supporting' ? 2 : 1)) {
        const statusParts = [];
        if (char.currentLocation) statusParts.push(`위치:${char.currentLocation}`);
        if (char.emotionalState) statusParts.push(`감정:${char.emotionalState}`);
        if (char.injuries?.length) statusParts.push(`부상:${char.injuries[0]}`);

        coreCharacters.push({
          name: char.name,
          role: char.role || 'other',
          status: statusParts.join(', ') || '정상',
        });
      }
    }
  }

  // 4. 긴급 미해결 떡밥 (중요도 8+ 만)
  const urgentHooks: string[] = [];

  if (context.unresolvedHooks) {
    for (const hook of context.unresolvedHooks) {
      if (hook.importance >= 8) {
        urgentHooks.push(`[${hook.createdInEpisodeNumber}화] ${hook.summary}`);
      }
    }
  }

  // 토큰 절감 효과 추정 (대략적)
  const fullContextLength = JSON.stringify(context).length;
  const compressedLength =
    overallSynopsis.length +
    previousEndings.reduce((sum, e) => sum + e.lastParagraphs.length, 0) +
    coreCharacters.length * 50 +
    urgentHooks.join('').length;

  const estimatedTokenReduction = Math.round((1 - compressedLength / fullContextLength) * 100);

  console.log('[DynamicContext] 컨텍스트 압축 완료:', {
    originalChars: fullContextLength,
    compressedChars: compressedLength,
    reductionPercent: estimatedTokenReduction,
    coreCharCount: coreCharacters.length,
    urgentHookCount: urgentHooks.length,
  });

  return {
    overallSynopsis,
    previousEndings,
    coreCharacters,
    urgentHooks,
    estimatedTokenReduction,
  };
}

/**
 * 다이내믹 컨텍스트를 프롬프트 문자열로 직렬화
 */
export function serializeDynamicContext(dynamicContext: DynamicContextSummary): string {
  const sections: string[] = [];

  // 1. 전체 시놉시스 3줄 요약
  if (dynamicContext.overallSynopsis) {
    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  📋 [핵심 컨텍스트] 스토리 흐름 3줄 요약                                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝

${dynamicContext.overallSynopsis}
`);
  }

  // 2. 직전 회차 엔딩 (이어쓰기 필수)
  if (dynamicContext.previousEndings.length > 0) {
    const endingContent = dynamicContext.previousEndings
      .map(e => `【${e.episodeNumber}화 마지막】\n${e.lastParagraphs}`)
      .join('\n\n');

    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🔗 [이어쓰기 필수] 직전 회차 엔딩 - 여기서 바로 이어서 작성하라              ║
╚═══════════════════════════════════════════════════════════════════════════════╝

${endingContent}

🚨 위 마지막 문장 직후부터 1초의 시간 건너뜀 없이 작성 시작
`);
  }

  // 3. 핵심 캐릭터 상태 (최소 정보)
  if (dynamicContext.coreCharacters.length > 0) {
    const charList = dynamicContext.coreCharacters
      .map(c => `• ${c.name} [${c.role}]: ${c.status}`)
      .join('\n');

    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  👥 [핵심 캐릭터 상태]                                                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝

${charList}
`);
  }

  // 4. 긴급 떡밥 (중요도 8+)
  if (dynamicContext.urgentHooks.length > 0) {
    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  💡 [긴급 떡밥] 회수 고려 대상                                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝

${dynamicContext.urgentHooks.map(h => `• ${h}`).join('\n')}
`);
  }

  return sections.join('\n');
}
