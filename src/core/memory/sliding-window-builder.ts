import { createServiceRoleClient } from '@/lib/supabase/server';
import type {
  SlidingWindowContext,
  EpisodeLogSummary,
  CharacterCurrentState,
  UnresolvedHook,
  WritingPreference,
  LongTermMemoryResult,
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
  } = {}
): Promise<SlidingWindowContext> {
  const {
    windowSize = 3,
    longTermSearchQueries = [],
    includeWritingPreferences = true,
  } = options;

  const supabase = createServiceRoleClient();

  // 병렬로 모든 컨텍스트 데이터 조회
  const [
    worldBibleResult,
    recentLogsResult,
    charactersResult,
    unresolvedHooksResult,
    writingMemoriesResult,
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

  const writingPreferences: WritingPreference[] = (writingMemoriesResult.data || []).map(mem => ({
    feedbackType: mem.feedback_type,
    preferenceSummary: mem.preference_summary,
    avoidPatterns: mem.avoid_patterns || [],
    favorPatterns: mem.favor_patterns || [],
    confidence: mem.confidence ?? 0.5,
  }));

  // 직전 회차의 마지막 500자 추출
  const lastSceneAnchor = recentLogs.length > 0 ? recentLogs[0].last500Chars : '';

  return {
    worldBible: worldBibleResult.data,
    recentLogs,
    lastSceneAnchor,
    activeCharacters,
    unresolvedHooks,
    writingPreferences,
    longTermMemories: longTermMemories.length > 0 ? longTermMemories : undefined,
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
