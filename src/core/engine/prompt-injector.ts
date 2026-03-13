import type { SlidingWindowContext, TimelineEvent, ActiveCharacter } from '@/types/memory';
import { buildWritingMemoryPrompt, logInjectedRules } from '@/lib/utils/writing-memory';

// Writing Memory 시스템 규칙 로드 확인 (서버 시작 시 1회)
if (typeof window === 'undefined') {
  logInjectedRules();
}

// ============================================================================
// 프롬프트 동적 주입기 v9.0
// ============================================================================
// V9.0 아키텍처 개편: "규칙 엔진(Rule Engine)에서 작가실(Writer's Room)로"
//
// 핵심 변경:
// 1. 20,000토큰 헌법 → 1,000토큰 이하 3-Layer XML 구조로 압축
// 2. 시놉시스 최상단 배치 (최우선 가중치)
// 3. 메타 단어 원천 차단 (주인공, 히로인 등)
// 4. 2-Step 파이프라인: Scene Plan → Prose Generate
// ============================================================================

// ============================================================================
// Layer 0: 절대 규칙 (ABSOLUTE RULES)
// ============================================================================
// ============================================================================
// V9.3: 장르 중립 시스템 프롬프트 - 프로젝트별 설정은 World Bible/Character DB에서 로드
// ============================================================================
const ABSOLUTE_RULES = `
<absolute_rules>
너는 상업 웹소설 작가다. 독자가 다음 화를 클릭하게 만드는 것이 유일한 목표다.

★★★ 0. [시놉시스 절대 준수] ★★★
   유저 프롬프트 최상단의 <episode_synopsis>에 적힌 씬 구성을 100% 따라야 한다.
   시놉시스에 적힌 장소에서 시작해야 한다. 시놉시스에 없는 장면을 임의로 만들어내지 마라.
   시놉시스의 씬 순서, 장소, 사건을 임의로 변경하지 마라.
   시놉시스에 [씬1], [씬2], [씬3]... 이 있으면 모든 씬을 순서대로 포함해야 한다.

1. [설정 엄수] 세계관/캐릭터 DB에 등록된 설정만 사용. DB에 없는 인물/조직/세력 창조 금지. (점소이, 상인 등 단순 엑스트라만 허용)
2. [세계관 금지사항 준수] 세계관 설정의 [금지된 것] 목록을 반드시 지켜라.
3. [금지어] 마크다운, 현대 외래어 사용 금지. 소설 본문 내에 '주인공', '히로인', '엑스트라', '시놉시스', '복선', '떡밥', '빌런', '조연' 같은 메타 단어 절대 사용 금지. (반드시 이름이나 대명사 '소년', '노인', '그', '여인' 등으로 지칭)
4. [분량 및 엔딩] 4,000~6,000자 엄수. 마지막은 다음 화를 읽고 싶게 만드는 장면(위기/발견/반전/충격적 선언)으로 끝내라.
5. [설명 금지] 독자에게 직접 알려주지 마라.
   - "~였다/~었다" 종결이 3문장 연속 오면 안 된다.
   - "흥미로웠다", "이상했다", "거짓말이었다" 같은 감상/판정 서술 금지.
   - "그는 알았다/느꼈다/깨달았다/직감했다" 직접 인지 서술 금지.
   - 대신: 신체 반응, 행동, 감각, 대사로 보여줘라.
6. [주인공은 행동한다] 매 화 최소 2번은 주인공이 스스로 선택하고 행동하는 장면이 있어야 한다.
   끌려가기만 하고, 관찰하기만 하고, 생각하기만 하는 것은 소설이 아니라 설정집이다.
7. [시놉시스 금지사항] 시놉시스의 [금지] 또는 forbidden 항목에 적힌 내용을 반드시 지켜라.
</absolute_rules>
`;

// ============================================================================
// Layer 1: 문체 DNA (STYLE DNA)
// ============================================================================
const STYLE_DNA = `
<style_dna>
[서술 원칙]
- Show, Don't Tell. 감정을 직접 쓰지 말고 '신체 반응'으로 보여줘라.
- 대사 비율은 전체의 25% 이하. 대사(" ") 앞뒤로는 반드시 빈 줄 삽입. 한 문단은 최대 2~3문장.
- 모든 씬에 '갈등(Conflict)'이나 '선택의 기로'가 있어야 한다. 밋밋한 이동이나 설명 씬 금지.

[Tell 금지 — 나쁜 예 vs 좋은 예]
× "거짓말이었다. 그는 그것을 직감적으로 알았다."
○ 그의 미소가 눈가에 닿지 않았다. 손가락 끝이 탁자를 두드리는 박자가 미묘하게 불규칙했다.

× "흥미로운 일이었다."
○ 입꼬리가 올라갔다. 이건 뭐지. 손을 쥐었다 폈다. 남의 손처럼 낯설면서도 묘하게 익숙했다.

× "그의 직감이 경고했다."
○ 뒷목이 서늘했다. 온화한 미소 뒤에서 무언가가 꿈틀거렸다.

× "전생에서 수많은 정치적 음모를 경험한 그였다."
○ (쓰지 마라. 과거 경력을 직접 설명하지 마라. 행동으로 드러내라.)

[감정 표현 강제]
주인공에게 큰 일이 벌어졌을 때(회귀, 빙의, 위기 등), "신기했다/이상했다/흥미로웠다"로 퉁치지 마라.
반드시 포함:
- 신체 반응: 떨림, 구역질, 심장 박동, 식은땀, 호흡 변화
- 감각 혼란: 시야 흔들림, 귀 울림, 냄새 왜곡
- 즉각적 행동: 손으로 얼굴을 만짐, 벽을 짚음, 비명을 삼킴

[대사 톤]
캐릭터 DB의 speech_pattern을 따라라. 캐릭터별 말투가 지정되어 있으면 반드시 그 톤으로 대사를 작성하라.
</style_dna>
`;

// ============================================================================
// Layer 2: 이어쓰기 규칙 (2화 이상일 때만 동적 주입)
// ============================================================================
function getContinuityRule(episodeNumber: number): string {
  if (episodeNumber <= 1) return '';
  return `
<continuity_rule>
직전 화 마지막 장면에서 1초의 시간 건너뜀 없이 이어서 작성해라. 시간 점프나 뜬금없는 장소 전환으로 시작하지 마라.
</continuity_rule>
`;
}

// ============================================================================
// 집필 파이프라인 지시문 (Scene Plan → Prose)
// ============================================================================
const WRITING_PIPELINE_DIRECTIVE = `
<writing_pipeline>
본문을 작성하기 전에, 반드시 아래 형식의 [Scene Plan]을 먼저 작성하고, 그 대본에 맞춰 [Prose]를 집필해라.

[Scene Plan] 이번 화의 씬 구성을 계획해라. 각 씬에 반드시 포함:

씬 N:
- 장소/시간: (어디서, 언제)
- 핵심 갈등: (주인공이 무엇과 부딪히는가 — "없음"은 불가)
- 감정: (시작 감정 → 끝 감정)
- 주인공의 행동/선택: (주인공이 무엇을 하는가 — "끌려간다/관찰한다"는 행동이 아님)
- 독자의 감정: (이 씬에서 독자는 무엇을 느끼는가)

규칙:
- 최소 3개 씬, 최대 5개 씬
- 매 씬에 갈등이 있어야 한다 (외부 갈등 또는 내면 갈등)
- 주인공이 "생각만 하는" 씬은 1개 이하
- 마지막 씬은 반드시 절단신공 (위기/발견/반전/선언)

[Prose] 문단 구성 비율 — 반드시 지켜라:
- 장면 묘사(감각+행동): 50% 이상 (2,000자 이상)
- 대사+대사 전후 행동: 25% (1,000자)
- 내면 독백/심리: 15% 이하 (600자 이하)
- 직접 설명/배경 해설: 10% 이하 (400자 이하)

"~였다/~었다"로 끝나는 설명문이 전체의 30%를 넘으면 실패다.
4,000~6,000자의 소설 본문 작성. Scene Plan의 내용 외의 메타 텍스트는 출력하지 말 것.
</writing_pipeline>
`;

// ============================================================================
// 컴팩트 캐릭터 섹션 빌더
// ============================================================================
export function buildCompactCharacterSection(characters: ActiveCharacter[]): string {
  if (!characters || characters.length === 0) return '';

  const compactChars = characters
    .filter(c => c.role === 'protagonist' || c.role === 'antagonist' || c.role === 'supporting')
    .slice(0, 5) // 최대 5명
    .map(c => {
      const roleLabel = c.role === 'protagonist' ? '주인공' :
                       c.role === 'antagonist' ? '빌런' : '조연';
      const status = [
        c.currentLocation ? `위치:${c.currentLocation}` : '',
        c.emotionalState ? `감정:${c.emotionalState}` : '',
      ].filter(Boolean).join(', ');

      // ★★★ V9.3: 말투(speech_pattern) 추가 ★★★
      const speechInfo = c.speechPattern ? ` / 말투: ${c.speechPattern.substring(0, 40)}` : '';

      return `- ${c.name} [${roleLabel}]: ${c.personality?.substring(0, 30) || '성격 미설정'}${speechInfo} ${status ? `(${status})` : ''}`;
    })
    .join('\n');

  return `
<characters>
이번 화 등장인물 (DB에 없는 인물 창조 금지):
${compactChars}
</characters>
`;
}

// ============================================================================
// 컴팩트 세계관 섹션 빌더 - V9.3 forbidden_elements 강화
// ============================================================================
export function buildCompactWorldSection(worldBible: SlidingWindowContext['worldBible']): string {
  if (!worldBible) return '';

  const rules = Array.isArray(worldBible.absolute_rules)
    ? worldBible.absolute_rules.slice(0, 5).join('\n  - ')
    : typeof worldBible.absolute_rules === 'string'
      ? worldBible.absolute_rules.substring(0, 200)
      : '';

  // ★★★ V9.3: forbidden_elements 전체 표시 (장르 규칙의 핵심) ★★★
  const forbidden = worldBible.forbidden_elements?.length
    ? worldBible.forbidden_elements.map((f: string) => `  ❌ ${f}`).join('\n')
    : '  (없음)';

  return `
<world_bible>
[세계관 기본]
- 세계: ${worldBible.world_name || '미설정'}
- 시대: ${worldBible.time_period || '미설정'}
- 힘의 체계: ${worldBible.power_system_name || '없음'}

[세계관 절대 규칙]
  - ${rules || '없음'}

[이 세계에서 금지된 것 — 반드시 지켜라]
${forbidden}
</world_bible>
`;
}

// ============================================================================
// 시놉시스 섹션 빌더 (최상단 배치용) - V9.0.3 isCurrent fallback 추가
// ============================================================================
export function buildSynopsisSection(
  context: SlidingWindowContext,
  targetEpisodeNumber?: number
): string {
  // 1차: isCurrent로 찾기
  let currentSynopsis = context.episodeSynopses?.find(s => s.isCurrent);

  // 2차 Fallback: episodeNumber로 직접 매칭
  if (!currentSynopsis && targetEpisodeNumber && context.episodeSynopses) {
    currentSynopsis = context.episodeSynopses.find(
      s => s.episodeNumber === targetEpisodeNumber
    );
    if (currentSynopsis) {
      console.log('[SYNOPSIS-DEBUG] isCurrent fallback 사용:', {
        targetEpisodeNumber,
        foundEpisode: currentSynopsis.episodeNumber,
      });
    }
  }

  // 디버깅 로그 (V9.0.3 강화)
  console.log('[SYNOPSIS-DEBUG] buildSynopsisSection 호출:', {
    hasSynopses: !!context.episodeSynopses,
    synopsesCount: context.episodeSynopses?.length || 0,
    targetEpisodeNumber,
    allEpisodeNumbers: context.episodeSynopses?.map(s => s.episodeNumber) || [],
    currentFound: !!currentSynopsis,
    currentEpisode: currentSynopsis?.episodeNumber,
    synopsisPreview: currentSynopsis?.synopsis?.substring(0, 80) || 'NONE',
  });

  if (!currentSynopsis) {
    console.error('[CRITICAL] ★★★ 현재 회차 시놉시스를 찾을 수 없음! Story Bible 확인 필요 ★★★');
    return `
<episode_synopsis>
[⚠️ 시놉시스 없음] PD 지시사항을 따라 자유롭게 작성하되, 절대 규칙은 반드시 준수할 것.
</episode_synopsis>
`;
  }

  const parts: string[] = [];

  // ★★★ V9.3: 시놉시스 강제 (장르 중립) ★★★
  parts.push(`╔═══════════════════════════════════════════════════════════════════════════════╗`);
  parts.push(`║  🚨🚨🚨 [절대 명령] 시놉시스가 왕이다 - 아래 대본을 100% 따라 써라 🚨🚨🚨   ║`);
  parts.push(`║  시놉시스에 적힌 장소에서 시작하라. 임의 변경 = 실패                       ║`);
  parts.push(`║  시놉시스에 [씬1]~[씬N]이 있으면 모든 씬을 순서대로 포함하라              ║`);
  parts.push(`╚═══════════════════════════════════════════════════════════════════════════════╝`);
  parts.push(``);

  // ★★★ V9.1: 세계관 1줄 요약 (장르 오염 방지) ★★★
  if (context.worldBible) {
    const wb = context.worldBible;
    let worldLine = `[세계관]`;
    if (wb.world_name) worldLine += ` ${wb.world_name}`;
    if (wb.time_period) worldLine += ` — ${wb.time_period}`;
    if (wb.power_system_name) worldLine += ` / 힘의 체계: ${wb.power_system_name}`;
    parts.push(worldLine);
    parts.push(``);
  }

  parts.push(`<episode_synopsis episode="${currentSynopsis.episodeNumber}">`);
  parts.push(`[${currentSynopsis.episodeNumber}화 시놉시스 - 반드시 이 내용대로 작성]`);

  if (currentSynopsis.title) {
    parts.push(`제목: ${currentSynopsis.title}`);
  }

  // ★★★ 핵심 시놉시스 (가장 중요) ★★★
  parts.push(``);
  parts.push(`★★★ 핵심 시놉시스 (이 내용을 그대로 소설화하라):`);
  parts.push(`${currentSynopsis.synopsis}`);
  parts.push(``);

  if (currentSynopsis.sceneBeats) {
    parts.push(`★★★ 씬 대본 (이 순서대로 작성):`);
    parts.push(`${currentSynopsis.sceneBeats}`);
    parts.push(``);
  }

  if (currentSynopsis.goals && currentSynopsis.goals.length > 0) {
    parts.push(`★ 이번 화 목표: ${currentSynopsis.goals.join(' / ')}`);
  }

  if (currentSynopsis.keyEvents && currentSynopsis.keyEvents.length > 0) {
    parts.push(`★ 핵심 사건 순서: ${currentSynopsis.keyEvents.join(' → ')}`);
  }

  // V9.0 신규 필드
  if (currentSynopsis.emotionCurve) {
    parts.push(`감정 곡선: ${currentSynopsis.emotionCurve}`);
  }

  if (currentSynopsis.endingImage) {
    parts.push(`★ 마지막 장면 이미지: ${currentSynopsis.endingImage}`);
  }

  if (currentSynopsis.forbidden) {
    parts.push(`⛔ 이번 화 금지사항: ${currentSynopsis.forbidden}`);
  }

  if (currentSynopsis.foreshadowing && currentSynopsis.foreshadowing.length > 0) {
    parts.push(`깔 복선: ${currentSynopsis.foreshadowing.join(', ')}`);
  }

  if (currentSynopsis.callbacks && currentSynopsis.callbacks.length > 0) {
    parts.push(`회수할 복선: ${currentSynopsis.callbacks.join(', ')}`);
  }

  parts.push(`</episode_synopsis>`);
  parts.push(``);
  parts.push(`╔═══════════════════════════════════════════════════════════════════════════════╗`);
  parts.push(`║  ⚠️ 위 시놉시스의 장소, 사건, 순서를 절대 변경하지 마라                      ║`);
  parts.push(`║  시놉시스에 없는 장면을 임의로 추가하지 마라                                 ║`);
  parts.push(`╠═══════════════════════════════════════════════════════════════════════════════╣`);
  parts.push(`║  ★ [씬 강제 규칙] 시놉시스에 [씬1], [씬2], [씬3]... 이 있으면:              ║`);
  parts.push(`║    - 모든 씬을 순서대로 포함해야 한다. 어떤 씬도 건너뛰지 마라.             ║`);
  parts.push(`║    - 각 씬은 최소 600자 이상 작성해야 한다.                                  ║`);
  parts.push(`║    - "금지" 또는 "forbidden" 항목의 용어는 이 화에서 절대 사용하지 마라.    ║`);
  parts.push(`╚═══════════════════════════════════════════════════════════════════════════════╝`);

  return parts.join('\n');
}

// ============================================================================
// 직전 회차 엔딩 섹션 빌더 (800자로 축소) + Fallback 로직
// ============================================================================
export function buildPreviousEndingSection(context: SlidingWindowContext): string {
  // previousEpisodeEnding이 있으면 사용
  if (context.previousEpisodeEnding) {
    const ending = context.previousEpisodeEnding.slice(-800);
    return `
<previous_ending>
[직전 화 마지막 장면 - 여기서 바로 이어서 작성]
${ending}
</previous_ending>
`;
  }

  // Fallback: recentLogs에서 last500Chars 또는 summary 사용
  if (context.recentLogs && context.recentLogs.length > 0) {
    const lastLog = context.recentLogs[0];
    const fallbackEnding = lastLog.last500Chars || lastLog.summary;

    if (fallbackEnding) {
      console.warn('[V9.0.1] previousEpisodeEnding 누락, recentLogs fallback 사용');
      return `
<previous_ending>
[직전 화 마지막 장면 (fallback) - 여기서 바로 이어서 작성]
${fallbackEnding.slice(-800)}
</previous_ending>
`;
    }
  }

  console.error('[CRITICAL] 2화 이상인데 직전 화 엔딩이 없음! 연속성 문제 발생 가능');
  return '';
}

// ============================================================================
// 직전 회차 요약 섹션 빌더 (200자 이내)
// ============================================================================
export function buildPreviousSummarySection(context: SlidingWindowContext): string {
  if (!context.recentLogs || context.recentLogs.length === 0) return '';

  const lastLog = context.recentLogs[0];
  const summary = lastLog.summary.substring(0, 200);

  return `
<previous_summary>
[${lastLog.episodeNumber}화 요약] ${summary}${lastLog.summary.length > 200 ? '...' : ''}
</previous_summary>
`;
}

// ============================================================================
// V9.0 시스템 프롬프트 빌더
// ============================================================================
export function buildSystemPromptV9(targetEpisodeNumber: number): string {
  const writingMemoryPrompt = buildWritingMemoryPrompt();

  return [
    ABSOLUTE_RULES,
    STYLE_DNA,
    getContinuityRule(targetEpisodeNumber),
    writingMemoryPrompt,
  ].filter(Boolean).join('\n');
}

// ============================================================================
// V9.0.3 유저 프롬프트 빌더 - 시놉시스 최우선 배치 강화
// ============================================================================
export function buildUserPromptV9(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): string {
  const sections: string[] = [];

  // ★★★ 0. 시놉시스 (절대 최상단 - 프롬프트의 첫 번째 내용) ★★★
  const synopsisSection = buildSynopsisSection(context, targetEpisodeNumber);
  sections.push(synopsisSection);

  // 디버깅 로그
  console.log('[PROMPT-DEBUG] 시놉시스 섹션 길이:', synopsisSection.length);
  console.log('[PROMPT-DEBUG] 시놉시스 섹션 처음 200자:', synopsisSection.substring(0, 200));

  // 1. PD 지시사항
  sections.push(`
<pd_instruction>
${targetEpisodeNumber}화 작성 요청:
${userInstruction}
</pd_instruction>
`);

  // 2. 직전 화 엔딩 (800자) - 이어쓰기용
  if (targetEpisodeNumber > 1) {
    sections.push(buildPreviousEndingSection(context));
  }

  // 3. 등장인물 (컴팩트)
  sections.push(buildCompactCharacterSection(context.activeCharacters));

  // 4. 세계관 (컴팩트)
  sections.push(buildCompactWorldSection(context.worldBible));

  // 5. 직전 회차 요약 (200자)
  if (targetEpisodeNumber > 1) {
    sections.push(buildPreviousSummarySection(context));
  }

  // 6. 집필 파이프라인 지시문
  sections.push(WRITING_PIPELINE_DIRECTIVE);

  // 7. 분량 및 비율 강조
  sections.push(`
<output_format>
- [Scene Plan] 작성 후 [Prose]에 본문 작성
- 분량: 4,000~6,000자 (필수)
- 장면 묘사 50% 이상, 대사 25%, 심리 15% 이하, 설명 10% 이하
- "~였다/~었다" 설명문 30% 이하
- 주인공의 능동적 행동/선택 2회 이상
- 마지막: 반드시 절단신공으로 끝낼 것
</output_format>
`);

  // ★★★ 8. V9.0.3: 시놉시스 최종 리마인더 (프롬프트 끝에 다시 강조) ★★★
  // isCurrent fallback 적용
  let currentSynopsis = context.episodeSynopses?.find(s => s.isCurrent);
  if (!currentSynopsis && context.episodeSynopses) {
    currentSynopsis = context.episodeSynopses.find(s => s.episodeNumber === targetEpisodeNumber);
  }

  if (currentSynopsis) {
    const firstScene = currentSynopsis.sceneBeats?.split('\n')[0] ||
                       currentSynopsis.keyEvents?.[0] ||
                       currentSynopsis.synopsis?.substring(0, 80) || '';
    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🚨 [최종 확인] ${targetEpisodeNumber}화 집필 시작                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝

다시 한번 확인: 위 <episode_synopsis>에 적힌 내용을 100% 따라 작성하라.

첫 번째 씬: "${firstScene}"
→ 이 씬부터 시작하라. 시놉시스에 없는 장면을 임의로 추가하지 마라.

시놉시스 = 왕. AI 작가 = 시놉시스를 소설화하는 집행자.
`);
  } else {
    console.error('[PROMPT-DEBUG] ⚠️ 최종 리마인더 생성 불가 - 시놉시스 없음');
  }

  const finalPrompt = sections.filter(Boolean).join('\n');

  // 최종 프롬프트 디버깅
  console.log('[PROMPT-DEBUG] 최종 유저 프롬프트 구성:', {
    totalLength: finalPrompt.length,
    hasSynopsis: finalPrompt.includes('<episode_synopsis'),
    hasReminder: finalPrompt.includes('최종 확인'),
    first100Chars: finalPrompt.substring(0, 100),
  });

  return finalPrompt;
}

// ============================================================================
// V9.0.3 에피소드 생성 프롬프트 조립 (메인 함수)
// ============================================================================
export function buildEpisodeGenerationPrompts(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): { systemPrompt: string; userPrompt: string } {
  // ★★★ V9.0.3: 시놉시스 디버깅 강화 ★★★
  const synopsesInfo = context.episodeSynopses || [];
  const currentByFlag = synopsesInfo.find(s => s.isCurrent);
  const currentByNumber = synopsesInfo.find(s => s.episodeNumber === targetEpisodeNumber);

  console.log('[SYNOPSIS-DEBUG] ===== 프롬프트 생성 시작 =====');
  console.log('[SYNOPSIS-DEBUG] targetEpisodeNumber:', targetEpisodeNumber);
  console.log('[SYNOPSIS-DEBUG] 시놉시스 배열 길이:', synopsesInfo.length);
  console.log('[SYNOPSIS-DEBUG] 시놉시스 에피소드 목록:', synopsesInfo.map(s => s.episodeNumber));
  console.log('[SYNOPSIS-DEBUG] isCurrent로 찾음:', !!currentByFlag, currentByFlag?.episodeNumber);
  console.log('[SYNOPSIS-DEBUG] episodeNumber로 찾음:', !!currentByNumber, currentByNumber?.episodeNumber);

  if (currentByFlag || currentByNumber) {
    const syn = currentByFlag || currentByNumber;
    console.log('[SYNOPSIS-DEBUG] ✅ 시놉시스 발견:', {
      episodeNumber: syn?.episodeNumber,
      title: syn?.title,
      synopsisLength: syn?.synopsis?.length,
      synopsisPreview: syn?.synopsis?.substring(0, 100),
      hasSceneBeats: !!syn?.sceneBeats,
      sceneBeatsPreview: syn?.sceneBeats?.substring(0, 100),
    });
  } else {
    console.error('[SYNOPSIS-DEBUG] ❌ 시놉시스를 찾을 수 없음!');
  }

  // 컨텍스트 로딩 로그
  console.log('[PROMPT-DEBUG] 컨텍스트 상태:', {
    episode: targetEpisodeNumber,
    hasWorldBible: !!context.worldBible,
    characterCount: context.activeCharacters?.length || 0,
    hasPreviousEnding: !!context.previousEpisodeEnding,
    previousEndingLength: context.previousEpisodeEnding?.length || 0,
  });

  const systemPrompt = buildSystemPromptV9(targetEpisodeNumber);
  const userPrompt = buildUserPromptV9(context, userInstruction, targetEpisodeNumber);

  // 최종 검증 로그
  console.log('[PROMPT-DEBUG] ===== 프롬프트 생성 완료 =====');
  console.log('[PROMPT-DEBUG] 시스템 프롬프트 길이:', systemPrompt.length);
  console.log('[PROMPT-DEBUG] 유저 프롬프트 길이:', userPrompt.length);
  console.log('[PROMPT-DEBUG] 유저 프롬프트 시작:', userPrompt.substring(0, 300));

  // 시놉시스 포함 여부 최종 확인
  const hasSynopsisTag = userPrompt.includes('<episode_synopsis');
  const hasReminderTag = userPrompt.includes('최종 확인');
  console.log('[PROMPT-DEBUG] 시놉시스 태그 포함:', hasSynopsisTag);
  console.log('[PROMPT-DEBUG] 최종 리마인더 포함:', hasReminderTag);

  if (!hasSynopsisTag) {
    console.error('[CRITICAL] ❌ 유저 프롬프트에 시놉시스가 포함되지 않음!');
  }

  return { systemPrompt, userPrompt };
}

// ============================================================================
// [Prose] 파싱 유틸리티
// ============================================================================
export interface ProseParseResult {
  scenePlan: string | null;
  prose: string;
  raw: string;
}

/**
 * AI 출력에서 [Scene Plan]과 [Prose] 섹션을 파싱
 * [Prose] 이후의 본문만 에디터에 표시
 */
export function parseProseFromOutput(content: string): ProseParseResult {
  const raw = content;

  // [Prose] 태그 이후 텍스트 추출
  const proseMatch = content.match(/\[Prose\]\s*([\s\S]*)/i);

  if (proseMatch) {
    const prose = proseMatch[1].trim();

    // [Scene Plan] 추출 (디버깅/로깅용)
    const scenePlanMatch = content.match(/\[Scene Plan\]\s*([\s\S]*?)\[Prose\]/i);
    const scenePlan = scenePlanMatch ? scenePlanMatch[1].trim() : null;

    return { scenePlan, prose, raw };
  }

  // [Prose] 태그가 없으면 전체를 prose로 반환
  // (기존 방식 호환성)
  return { scenePlan: null, prose: content, raw };
}

/**
 * 스트리밍 중 [Prose] 이후 텍스트만 필터링
 */
export function filterProseFromStream(content: string): string {
  // [Prose] 태그 발견 시 그 이후만 반환
  const proseIndex = content.indexOf('[Prose]');

  if (proseIndex !== -1) {
    return content.substring(proseIndex + 7).trimStart(); // '[Prose]' 길이 = 7
  }

  // [Scene Plan]이 있고 [Prose]가 아직 없으면 빈 문자열 반환 (아직 본문 미시작)
  if (content.includes('[Scene Plan]')) {
    return '';
  }

  // 둘 다 없으면 전체 반환 (기존 방식)
  return content;
}

// ============================================================================
// 로그 압축용 프롬프트 조립 (기존 유지)
// ============================================================================
export function buildLogCompressionPrompts(episodeContent: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `당신은 웹소설 에피소드 분석 전문가입니다.
에피소드를 읽고 핵심 정보를 JSON 형태로 정확하게 추출합니다.
반드시 유효한 JSON만 출력하세요.`;

  const userPrompt = `다음 에피소드를 분석하여 핵심 정보를 추출하세요.

【에피소드 내용】
"""
${episodeContent}
"""

【출력 형식】
아래 JSON 구조를 정확히 따르세요. 다른 텍스트 없이 JSON만 출력하세요.

\`\`\`json
{
  "summary": "200자 내외의 줄거리 요약 (핵심 사건과 결과 중심으로)",
  "characterStates": {
    "캐릭터명": {
      "changes": ["이번 화에서의 상태 변화 목록"],
      "emotionalArc": "감정 변화 (예: 분노 → 결의)"
    }
  },
  "itemChanges": {
    "gained": ["획득한 아이템 목록"],
    "lost": ["상실한 아이템 목록"]
  },
  "relationshipChanges": [
    {"characters": ["캐릭터A", "캐릭터B"], "change": "관계 변화 설명"}
  ],
  "foreshadowing": ["새로 뿌린 떡밥/복선 목록"],
  "resolvedHooks": ["이번 화에서 회수된 떡밥 목록"]
}
\`\`\`

해당 항목이 없으면 빈 배열 [] 또는 빈 객체 {}를 사용하세요.`;

  return { systemPrompt, userPrompt };
}

// ============================================================================
// 피드백 분석용 프롬프트 조립 (기존 유지)
// ============================================================================
export function buildFeedbackAnalysisPrompts(
  originalText: string,
  editedText: string
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `당신은 문체 분석 전문가입니다.
사용자가 AI 작성 원문을 어떻게 수정했는지 분석하여, 문체 선호도를 추출합니다.
반드시 유효한 JSON만 출력하세요.`;

  const userPrompt = `원문과 수정본을 비교하여 사용자의 문체 선호도를 분석하세요.

【원문 (AI 작성)】
"""
${originalText}
"""

【수정본 (사용자 편집)】
"""
${editedText}
"""

【출력 형식】
\`\`\`json
{
  "feedbackType": "style | vocabulary | pacing | dialogue | description | structure 중 하나",
  "preferenceSummary": "사용자 선호도 요약 (한 문장)",
  "avoidPatterns": ["사용자가 피하고 싶어하는 표현/패턴 목록"],
  "favorPatterns": ["사용자가 선호하는 표현/패턴 목록"],
  "confidence": 0.5에서 1.0 사이의 신뢰도 (변화가 명확할수록 높음)
}
\`\`\``;

  return { systemPrompt, userPrompt };
}

// ============================================================================
// 테스트용 더미 컨텍스트 (기존 호환성 유지)
// ============================================================================
export function createTestContext(): SlidingWindowContext {
  console.warn('[DEPRECATED] createTestContext() 사용됨 - 실제 DB 데이터 사용 권장');

  return {
    worldBible: {
      id: 'test-world-bible',
      project_id: 'test-project',
      world_name: '테스트 무림',
      time_period: '가상의 고대 중원',
      geography: '중원 대륙',
      power_system_name: '내공',
      power_system_rules: '물리 법칙 기반 무술',
      power_system_ranks: null,
      absolute_rules: ['환각 금지', '설정 엄수'],
      forbidden_elements: ['현대 외래어', '판타지 무공'],
      additional_settings: null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    recentLogs: [],
    lastSceneAnchor: '',
    activeCharacters: [],
    unresolvedHooks: [],
    writingPreferences: [],
  };
}

// ============================================================================
// 레거시 호환 함수들 (기존 API 유지)
// ============================================================================

/** @deprecated V9.0에서는 buildEpisodeGenerationPrompts 사용 권장 */
export function serializeContextToPrompt(context: SlidingWindowContext): string {
  console.warn('[DEPRECATED] serializeContextToPrompt() - V9.0에서는 buildUserPromptV9() 사용');
  return buildUserPromptV9(context, '', 1);
}

/** @deprecated */
export function buildEpisodeGenerationPrompt(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): string {
  console.warn('[DEPRECATED] buildEpisodeGenerationPrompt() - V9.0에서는 buildEpisodeGenerationPrompts() 사용');
  const { userPrompt } = buildEpisodeGenerationPrompts(context, userInstruction, targetEpisodeNumber);
  return userPrompt;
}

/** @deprecated */
export function buildLogCompressionPrompt(episodeContent: string): string {
  const { userPrompt } = buildLogCompressionPrompts(episodeContent);
  return userPrompt;
}

/** @deprecated */
export function buildFeedbackAnalysisPrompt(
  originalText: string,
  editedText: string
): string {
  const { userPrompt } = buildFeedbackAnalysisPrompts(originalText, editedText);
  return userPrompt;
}

// ============================================================================
// 레거시 호환: LogicCheck (V9.0에서는 ProseParseResult로 대체)
// ============================================================================
export interface LogicCheckResult {
  continuityCheck?: string;
  characterCheck?: string;
  plotCheck?: string;
  settingCheck?: string;
}

/** @deprecated V9.0에서는 parseProseFromOutput() 사용 */
export function parseAndRemoveLogicCheck(content: string): {
  cleanContent: string;
  logicCheck: LogicCheckResult | null;
} {
  // [Prose] 파싱으로 대체
  const { prose } = parseProseFromOutput(content);
  return {
    cleanContent: prose,
    logicCheck: null,
  };
}

// ============================================================================
// 캐릭터 상태 추적기 (기존 유지)
// ============================================================================
export interface CharacterStatusTracker {
  characterId: string;
  characterName: string;
  role: string;

  // 현재 상태
  currentLocation: string | null;
  emotionalState: string | null;
  injuries: string[];
  possessedItems: string[];

  // 이번 에피소드에서의 변화
  changesThisEpisode: {
    locationChange?: { from: string; to: string };
    emotionalChange?: { from: string; to: string };
    newInjuries?: string[];
    healedInjuries?: string[];
    gainedItems?: string[];
    lostItems?: string[];
  };

  // 마지막 업데이트 에피소드
  lastUpdatedEpisode: number;
}

export function updateCharacterStatusFromLog(
  existingTrackers: CharacterStatusTracker[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logData: any,
  episodeNumber: number
): CharacterStatusTracker[] {
  if (!logData?.characterStates) return existingTrackers;

  const updatedTrackers = [...existingTrackers];

  for (const [charName, charState] of Object.entries(logData.characterStates)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = charState as any;

    let tracker = updatedTrackers.find(t => t.characterName === charName);

    if (!tracker) {
      tracker = {
        characterId: `auto-${charName}`,
        characterName: charName,
        role: 'unknown',
        currentLocation: null,
        emotionalState: null,
        injuries: [],
        possessedItems: [],
        changesThisEpisode: {},
        lastUpdatedEpisode: episodeNumber,
      };
      updatedTrackers.push(tracker);
    }

    // 감정 상태 업데이트
    if (state.emotionalArc) {
      const emotions = state.emotionalArc.split('→').map((e: string) => e.trim());
      if (emotions.length > 0) {
        const newEmotion = emotions[emotions.length - 1];
        if (tracker.emotionalState !== newEmotion) {
          tracker.changesThisEpisode.emotionalChange = {
            from: tracker.emotionalState || '보통',
            to: newEmotion,
          };
          tracker.emotionalState = newEmotion;
        }
      }
    }

    // 변화 목록에서 부상/위치 추출
    if (state.changes && Array.isArray(state.changes)) {
      for (const change of state.changes) {
        const changeStr = String(change).toLowerCase();

        if (changeStr.includes('부상') || changeStr.includes('상처') || changeStr.includes('다침')) {
          if (!tracker.injuries.includes(change)) {
            tracker.injuries.push(change);
            tracker.changesThisEpisode.newInjuries = tracker.changesThisEpisode.newInjuries || [];
            tracker.changesThisEpisode.newInjuries.push(change);
          }
        }

        if (changeStr.includes('이동') || changeStr.includes('도착') || changeStr.includes('떠남')) {
          const locationMatch = change.match(/(?:이동|도착|떠남)[^\s]*\s*(.+)/);
          if (locationMatch) {
            const newLocation = locationMatch[1].trim();
            tracker.changesThisEpisode.locationChange = {
              from: tracker.currentLocation || '불명',
              to: newLocation,
            };
            tracker.currentLocation = newLocation;
          }
        }
      }
    }

    tracker.lastUpdatedEpisode = episodeNumber;
  }

  // 아이템 변화 처리
  if (logData.itemChanges) {
    if (logData.itemChanges.gained) {
      for (const item of logData.itemChanges.gained) {
        // 첫 번째 캐릭터(주인공)에게 추가
        if (updatedTrackers.length > 0) {
          const protagonist = updatedTrackers.find(t => t.role === 'protagonist') || updatedTrackers[0];
          if (!protagonist.possessedItems.includes(item)) {
            protagonist.possessedItems.push(item);
            protagonist.changesThisEpisode.gainedItems = protagonist.changesThisEpisode.gainedItems || [];
            protagonist.changesThisEpisode.gainedItems.push(item);
          }
        }
      }
    }

    if (logData.itemChanges.lost) {
      for (const item of logData.itemChanges.lost) {
        for (const tracker of updatedTrackers) {
          const idx = tracker.possessedItems.indexOf(item);
          if (idx !== -1) {
            tracker.possessedItems.splice(idx, 1);
            tracker.changesThisEpisode.lostItems = tracker.changesThisEpisode.lostItems || [];
            tracker.changesThisEpisode.lostItems.push(item);
          }
        }
      }
    }
  }

  return updatedTrackers;
}

export function serializeCharacterStatusForPrompt(trackers: CharacterStatusTracker[]): string {
  if (trackers.length === 0) return '';

  const statusLines = trackers
    .filter(t => t.role === 'protagonist' || t.role === 'antagonist' || t.role === 'supporting')
    .slice(0, 5)
    .map(t => {
      const parts = [`${t.characterName}`];
      if (t.currentLocation) parts.push(`위치:${t.currentLocation}`);
      if (t.emotionalState) parts.push(`감정:${t.emotionalState}`);
      if (t.injuries.length > 0) parts.push(`부상:${t.injuries[0]}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

  return `
<character_status>
${statusLines}
</character_status>
`;
}

// ============================================================================
// 티어 기반 캐릭터 강조 (기존 유지)
// ============================================================================
export function buildTierBasedCharacterEmphasis(characters: ActiveCharacter[]): string {
  if (!characters || characters.length === 0) return '';

  const tier1 = characters.filter(c => c.additionalData?.tier === 1);
  const tier2 = characters.filter(c => c.additionalData?.tier === 2);

  const sections: string[] = [];

  if (tier1.length > 0) {
    sections.push(`[핵심 인물] ${tier1.map(c => c.name).join(', ')}`);
  }

  if (tier2.length > 0) {
    sections.push(`[주요 조연] ${tier2.map(c => c.name).join(', ')}`);
  }

  return sections.join('\n');
}
