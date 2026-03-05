import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateCompletion } from '@/lib/ai/claude-client';
import type { LogCompressionResult } from '@/types/memory';
import type { Json } from '@/types/database';

/**
 * POST /api/ai/compress-log
 *
 * 에피소드 로그 압축 API
 * - 에피소드 내용을 받아 AI로 요약 생성
 * - 캐릭터 상태 변화, 아이템 변화, 떡밥 등 추출
 * - Fallback 로그를 실제 AI 로그로 대체
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { episodeId, projectId, useMock = false } = body;

    if (!episodeId || !projectId) {
      return NextResponse.json(
        { error: 'episodeId and projectId are required' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. 에피소드 조회
    const { data: episode, error: episodeError } = await supabase
      .from('episodes')
      .select('*')
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .single();

    if (episodeError || !episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // 2. 프로젝트의 캐릭터 목록 조회 (상태 업데이트용)
    const { data: characters } = await supabase
      .from('characters')
      .select('id, name, role, current_location, emotional_state, is_alive')
      .eq('project_id', projectId);

    // 3. 로그 압축 실행
    let compressionResult: LogCompressionResult;

    if (useMock) {
      // Mock 모드: 테스트용 더미 데이터
      compressionResult = generateMockCompressionResult(
        episode.content || '',
        episode.episode_number,
        characters || []
      );
    } else {
      // 실제 AI 호출
      compressionResult = await compressEpisodeLog(
        episode.content || '',
        episode.episode_number,
        characters || []
      );
    }

    // 4. episode_logs 테이블 업데이트 (fallback → 실제 로그)
    const last500Chars = (episode.content || '').slice(-500);

    const { data: existingLog } = await supabase
      .from('episode_logs')
      .select('id')
      .eq('episode_id', episodeId)
      .single();

    if (existingLog) {
      // 기존 fallback 로그 업데이트
      await supabase
        .from('episode_logs')
        .update({
          summary: compressionResult.summary,
          last_500_chars: last500Chars,
          is_fallback: false,
          raw_ai_response: JSON.parse(JSON.stringify(compressionResult)) as Json,
        })
        .eq('id', existingLog.id);
    } else {
      // 새 로그 생성
      await supabase.from('episode_logs').insert({
        episode_id: episodeId,
        project_id: projectId,
        episode_number: episode.episode_number,
        summary: compressionResult.summary,
        last_500_chars: last500Chars,
        is_fallback: false,
        raw_ai_response: JSON.parse(JSON.stringify(compressionResult)) as Json,
      });
    }

    // 5. 에피소드 로그 상태 업데이트
    await supabase
      .from('episodes')
      .update({
        log_status: 'completed',
        log_last_error: null,
      })
      .eq('id', episodeId);

    // 6. 큐 상태 업데이트
    await supabase
      .from('episode_log_queue')
      .update({
        queue_status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('episode_id', episodeId);

    // 7. 캐릭터 상태 업데이트 (선택적)
    if (characters && compressionResult.characterStates) {
      await updateCharacterStates(
        supabase,
        characters,
        compressionResult.characterStates
      );
    }

    // 8. 새로운 떡밥 등록 (선택적)
    if (compressionResult.foreshadowing?.length > 0) {
      await createNewHooks(
        supabase,
        projectId,
        episodeId,
        episode.episode_number,
        compressionResult.foreshadowing
      );
    }

    // 9. 해결된 떡밥 업데이트 (선택적)
    if (compressionResult.resolvedHooks?.length > 0) {
      await resolveHooks(
        supabase,
        projectId,
        episodeId,
        episode.episode_number,
        compressionResult.resolvedHooks
      );
    }

    return NextResponse.json({
      success: true,
      message: '로그 압축이 완료되었습니다.',
      result: compressionResult,
      episodeNumber: episode.episode_number,
    });
  } catch (error) {
    console.error('Log compression error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Log compression failed' },
      { status: 500 }
    );
  }
}

/**
 * AI를 사용한 에피소드 로그 압축
 */
async function compressEpisodeLog(
  content: string,
  episodeNumber: number,
  characters: Array<{ id: string; name: string; role: string | null }>
): Promise<LogCompressionResult> {
  const characterNames = characters.map((c) => c.name).join(', ');

  const systemPrompt = `당신은 웹소설 에피소드 분석 전문가입니다.
에피소드 내용을 분석하여 다음 화 집필에 필요한 핵심 정보를 추출합니다.

## 분석 원칙
1. **정확성**: 실제 에피소드에 있는 내용만 추출 (추측 금지)
2. **간결성**: 핵심만 요약, 불필요한 수식 제외
3. **연속성**: 다음 화 집필에 필요한 정보 위주
4. **객관성**: 사건의 사실만 기록, 해석 최소화

## 등장 가능 캐릭터
${characterNames || '(등록된 캐릭터 없음)'}

## 출력 형식 (JSON)
반드시 아래 형식의 유효한 JSON으로 응답하세요:
{
  "summary": "에피소드 핵심 줄거리 (200자 이내)",
  "characterStates": {
    "캐릭터이름": {
      "changes": ["상태 변화 1", "상태 변화 2"],
      "emotionalArc": "감정 변화 요약"
    }
  },
  "itemChanges": {
    "gained": ["획득한 아이템"],
    "lost": ["잃어버린 아이템"]
  },
  "relationshipChanges": [
    {
      "characters": ["캐릭터A", "캐릭터B"],
      "change": "관계 변화 설명"
    }
  ],
  "foreshadowing": ["새로 등장한 떡밥/복선"],
  "resolvedHooks": ["이번 화에서 해결된 떡밥"]
}`;

  const userPrompt = `## ${episodeNumber}화 에피소드 내용

${content}

---

위 에피소드를 분석하여 JSON 형식으로 결과를 출력하세요.`;

  const response = await generateCompletion({
    systemPrompt,
    userPrompt,
    maxTokens: 2048,
    temperature: 0.3,
  });

  // JSON 파싱
  try {
    // JSON 블록 추출 (```json ... ``` 형태 처리)
    let jsonText = response.text;
    const jsonMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // { } 블록 추출
      const braceMatch = jsonText.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonText = braceMatch[0];
      }
    }

    const result = JSON.parse(jsonText) as LogCompressionResult;
    return result;
  } catch {
    // 파싱 실패 시 기본 구조 반환
    console.error('Failed to parse AI response:', response.text);
    return {
      summary: `[${episodeNumber}화] ${response.text.substring(0, 200)}...`,
      characterStates: {},
      itemChanges: { gained: [], lost: [] },
      relationshipChanges: [],
      foreshadowing: [],
      resolvedHooks: [],
    };
  }
}

/**
 * Mock 로그 압축 결과 생성 (테스트용)
 */
function generateMockCompressionResult(
  content: string,
  episodeNumber: number,
  characters: Array<{ id: string; name: string; role: string | null }>
): LogCompressionResult {
  // 대사 추출
  const dialogues = content
    .split('\n')
    .filter((line) => line.includes('"'))
    .slice(0, 3);

  const protagonists = characters.filter((c) => c.role === 'protagonist');
  const mainCharName = protagonists[0]?.name || '주인공';

  return {
    summary: `[${episodeNumber}화 요약] ${content.substring(0, 150).replace(/\n/g, ' ')}...`,
    characterStates: {
      [mainCharName]: {
        changes: ['새로운 상황에 직면', '내적 갈등 심화'],
        emotionalArc: '평온 → 긴장 → 결의',
      },
    },
    itemChanges: {
      gained: [],
      lost: [],
    },
    relationshipChanges: [],
    foreshadowing: dialogues.length > 0 ? ['의문의 복선 등장'] : [],
    resolvedHooks: [],
  };
}

/**
 * 캐릭터 상태 업데이트
 */
async function updateCharacterStates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  characters: Array<{ id: string; name: string }>,
  characterStates: LogCompressionResult['characterStates']
) {
  for (const [charName, state] of Object.entries(characterStates)) {
    const character = characters.find(
      (c) => c.name === charName || c.name.includes(charName)
    );
    if (!character) continue;

    // 감정 상태 업데이트
    if (state.emotionalArc) {
      const emotionalState = extractEmotionalState(state.emotionalArc);
      await supabase
        .from('characters')
        .update({
          emotional_state: emotionalState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', character.id);
    }
  }
}

/**
 * 감정 상태 추출
 */
function extractEmotionalState(emotionalArc: string): string {
  // "평온 → 긴장 → 결의" 형태에서 마지막 상태 추출
  const parts = emotionalArc.split(/[→>]/);
  return parts[parts.length - 1]?.trim() || 'neutral';
}

/**
 * 새로운 떡밥 등록
 */
async function createNewHooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  episodeId: string,
  episodeNumber: number,
  foreshadowing: string[]
) {
  const hooks = foreshadowing.map((hook) => ({
    project_id: projectId,
    hook_type: 'foreshadowing',
    summary: hook,
    keywords: extractKeywords(hook),
    created_in_episode_id: episodeId,
    created_in_episode_number: episodeNumber,
    status: 'open',
    importance: 5,
  }));

  if (hooks.length > 0) {
    await supabase.from('story_hooks').insert(hooks);
  }
}

/**
 * 해결된 떡밥 업데이트
 */
async function resolveHooks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  episodeId: string,
  episodeNumber: number,
  resolvedHooks: string[]
) {
  for (const hookSummary of resolvedHooks) {
    // 유사한 떡밥 검색
    const { data: hooks } = await supabase
      .from('story_hooks')
      .select('id, summary')
      .eq('project_id', projectId)
      .eq('status', 'open')
      .ilike('summary', `%${hookSummary.substring(0, 20)}%`)
      .limit(1);

    if (hooks && hooks.length > 0) {
      await supabase
        .from('story_hooks')
        .update({
          status: 'resolved',
          resolved_in_episode_id: episodeId,
          resolved_in_episode_number: episodeNumber,
          resolution_summary: hookSummary,
          updated_at: new Date().toISOString(),
        })
        .eq('id', hooks[0].id);
    }
  }
}

/**
 * 키워드 추출 (간단한 구현)
 */
function extractKeywords(text: string): string[] {
  // 2글자 이상의 명사성 단어 추출 (간단한 휴리스틱)
  const words = text
    .replace(/[.,!?'"]/g, '')
    .split(/\s+/)
    .filter((word) => word.length >= 2 && word.length <= 10);

  return [...new Set(words)].slice(0, 5);
}
