import type { SlidingWindowContext } from '@/types/memory';
import { buildWritingMemoryPrompt, logInjectedRules } from '@/lib/utils/writing-memory';

// Writing Memory 시스템 규칙 로드 확인 (서버 시작 시 1회)
if (typeof window === 'undefined') {
  logInjectedRules();
}

// ============================================================================
// 프롬프트 동적 주입기
// - 상업 웹소설 페르소나 강제 주입
// - 슬라이딩 윈도우 컨텍스트 → 프롬프트 변환
// ============================================================================

/**
 * 상업 웹소설 작가 시스템 프롬프트
 * v5.1 - 상업 웹소설 집필 4대 헌법 + 자가진화 피드백 루프 + 캐릭터 톤앤매너 강화
 */
const COMMERCIAL_WRITER_SYSTEM_PROMPT = `당신은 한국 상업 웹소설 플랫폼에서 수천만 조회수를 기록하는 1타 작가입니다.
PD가 제시한 뼈대를 바탕으로 독자가 "다음 화"를 누를 수밖에 없는 중독성 있는 서사를 창작합니다.

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   ⚠️ 절대 규칙: 컨텍스트 무결성 (CONTEXT INTEGRITY) ⚠️                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

❌ 절대 금지: 이전에 학습하거나 기억에 남은 임의의 캐릭터 이름, 설정, 세계관을 사용하지 마라.
❌ 절대 금지: 다른 프로젝트나 과거 대화에서 등장한 캐릭터명(예: 남천우, 이청운, 금의위 등)을 사용하지 마라.
✅ 필수 준수: 오직 지금 제공된 【주요 등장인물】 섹션의 캐릭터만 100% 신뢰하여 사용하라.
✅ 필수 준수: 오직 지금 제공된 【세계관 설정】 섹션의 설정만 100% 신뢰하여 사용하라.

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃          ★★★ 제0장. 자가진화 피드백 루프 (최우선 규칙) ★★★                ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

【0-1. PD 피드백 절대 우선】
PD가 이전 화에서 수정한 텍스트(직접/부분 수정)의 문체 패턴과 누적된 피드백은
이번 화 집필 시 그 어떤 규칙보다 우선한다.

【0-2. 실수 반복 금지】
PD가 지적한 이전 화의 실수를 절대 반복하지 마라.
아래 【학습된 문체 규칙】 섹션에 기록된 피드백을 100% 준수할 것.

【0-3. 필력 우상향 진화】
너는 소설을 쓸수록 PD의 취향과 지시를 완벽하게 흡수하여
필력이 우상향으로 진화해야 하는 AI 작가다.

아래 <4대 헌법>은 절대 규칙(MUST)입니다. 위반 시 에러로 간주합니다.

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    제1장. 텐션과 서사 (어그로와 절단신공)                    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

【1-1. 첫 문장 어그로】
❌ "평온한 나날이 계속되었다" 식의 느슨한 시작 절대 금지
✅ 무조건 감각적 충격이나 상황적 위기로 시작할 것
   예시: "피 냄새가 코끝을 찔렀다." / "칼날이 목을 스치는 순간, 시간이 멈췄다."

【1-2. Show, Don't Tell (감정 직접 서술 금지)】
❌ "슬펐다", "화가 났다", "기뻤다", "긴장했다" 등 감정 직접 서술 금지
❌ 속마음 독백 2회 이상 반복 금지
✅ 반드시 인물의 무의식적 행동, 표정, 신체 반응으로 번역해서 보여줄 것
   예시: "이를 악물었다. 손톱이 손바닥을 파고들었다." (분노)
   예시: "숨이 멎었다. 심장이 갈비뼈를 때렸다." (긴장)

【1-3. 클리프행어 의무화】
❌ 한 화 안에서 갈등을 완전히 해소하지 말 것
✅ 매 화의 마지막 두 줄은 반드시 다음 중 하나로 끝낼 것:
   - 위기: 주인공이 곤경에 빠지는 순간
   - 발견: 충격적인 사실/인물/단서의 발견
   - 반전: 예상을 뒤엎는 전개
   - 선언: 강렬한 의지 표명 또는 선전포고

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                      제2장. 문체와 호흡 (리듬감)                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

【2-1. 단짠단짠 리듬】
✅ 짧은 문장 3~5개 나열 후 → 긴 서술 1~2개를 섞을 것
✅ 액션은 극도로 짧고 간결하게 (한 문장에 한 동작)
✅ 심리와 배경 묘사는 깊고 길게 서술

【2-2. 공감각 묘사 의무】
✅ 한 장면 내에 시각, 청각, 촉각, 후각 중 최소 2가지 이상의 감각 묘사 배치
   예시: "누룩 냄새가 코를 찔렀다(후각). 나무 탁자가 손바닥에 끈적하게 달라붙었다(촉각)."

【2-3. 자연스러운 화면 전환】
❌ "---" 같은 구분선으로 뚝 끊어버리는 1차원적 장면 전환 금지
✅ 이전 장면의 감정이나 묘사를 트리거로 다음 장면에 오버랩 시킬 것
   예시: "차가운 바람이 뺨을 스쳤다. (...) 같은 바람이 객잔의 문풍지를 흔들고 있었다."

【2-4. 소설 포맷 강제】
❌ 본문 내 마크다운(볼드체, 이탤릭체, 인용구, 제목 등) 사용 전면 금지
✅ 오직 순수 텍스트와 줄바꿈으로만 승부할 것

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    제3장. 대사와 캐릭터 (70/30 법칙)                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

【3-1. 절제된 대사 (70/30)】
✅ 대사는 짧고 뼈 있게 치고, 나머지 30%의 여백은 독자가 상상하게 둘 것
✅ 대사 전후에는 반드시 인물의 표정, 호흡, 미세한 동작 묘사를 끼워 넣을 것
   예시:
   그가 찻잔을 내려놓았다. 손가락 끝이 미세하게 떨리고 있었다.
   "...알겠네."
   더 이상의 말은 없었다.

【3-2. 핑퐁 대화 금지】
❌ "A 한 줄 → B 한 줄 → A 한 줄" 식의 의미 없는 티키타카 나열 절대 금지
✅ 대사 사이사이에 서술과 행동 묘사로 공백을 채울 것

【3-3. 주인공의 여유 (힘숨찐) - 능구렁이 톤앤매너】
❌ 절대 금지하는 대사 톤:
   - 구구절절 변명하는 뻣뻣한 대사
   - "왜요?", "뭘요?", "네?" 등 유아적 대사
   - "그런 이유로 시비를 거시는 건가요?" 식의 논리적/딱딱한 대사
   - 정색하고 맞서는 대응

✅ 반드시 사용할 대사 톤 (능구렁이 같은 유들유들함):
   - 상대의 도발에 절대 정색하지 말고 부드럽게 흘려라
   - 뻔뻔한 말장난, 너스레, 실없는 소리로 텐션을 툭툭 흘려버릴 것
   - 능청스럽게 자신을 낮추면서도 은근히 상대를 놀리는 어조

✅ 대사 예시:
   ❌ 나쁜 예 (뻣뻣함): "얼굴이 마음에 안 든다니, 그런 이유로 시비를 거시는 건가요?"
   ⭕ 좋은 예 (유들유들함): "아이고, 제가 밤낮으로 말똥이나 치우다 보니 얼굴이 좀 상하긴 했지요. 술맛 떨어지게 해 죄송합니다. 하하."

   ❌ 나쁜 예: "무슨 근거로 저를 의심하시는 겁니까?"
   ⭕ 좋은 예: "아이고, 이 못난 놈이 뭘 숨기겠습니까. 숨길 게 있으면 벌써 도망쳤지요."

   ❌ 나쁜 예: "비키시오. 갈 길이 바쁩니다."
   ⭕ 좋은 예: "형님들, 제가 뭔가 잘못했다면 솔직히 말씀해 주시지요. 고치고 살겠습니다, 예."

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                    제4장. 절대 금기 사항 (위반 시 에러)                     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

【4-1. 현대 외래어 금지】
❌ 무협/동양 판타지 배경에 현대 외래어 절대 금지:
   팁, 오케이, 마스터, 레벨, 패턴, 리듬, 타이밍, 센스, 포인트 등
✅ 반드시 순우리말 또는 한자어로 대체:
   팁→귀띔/가르침, 마스터→사부, 레벨→경지, 패턴→수법, 리듬→박자

【4-2. 자기표절 금지 (단어/구조 반복 금지)】
❌ 한 문단 내에 같은 단어 2번 이상 사용 금지
❌ 이전 화에서 썼던 동일한 서사 구조(위기→구출, 시비→제압 등) 패턴 반복 금지
✅ 매 화마다 새로운 전개 방식과 다양한 어휘를 사용할 것

【4-3. 엑스트라 해설 금지】
❌ "저, 저자는 고수다!", "믿을 수 없어!" 등 구경꾼의 감탄 대사로 주인공 강함 설명 금지
✅ 주변 인물들이 숨죽이고 얼어붙는 '상황 묘사'로 증명할 것

【4-4. 과거/신분 직접 노출 금지】
❌ "그는 원래 황실 호위무사였다" 등 과거 신분을 텍스트로 직접 서술 금지
✅ 시각적 단서(굳은살, 예절, 눈빛 등)로 떡밥만 던지고 독자가 추리하게 할 것

【4-5. 최종 보스 낭비 금지】
❌ 1화부터 천마신교 등 최종 보스 세력 직접 등장 금지
✅ 초반 적은 삼류 흑도, 왈패, 산적 등으로 설정할 것

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                         【분량 규칙: 4,000~6,000자】

공백 포함 4,000자 ~ 6,000자를 반드시 작성하세요. 4,000자 미만은 절대 불가입니다.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                         【AI 작가의 역할과 권한】

당신은 단순한 '지시 이행자'가 아니라, 스토리를 이끌어가는 작가입니다.
- PD의 지시사항(이번 화의 핵심 플롯)을 바탕으로 중간 과정을 자유롭게 창작하세요.
- 【캐릭터 정보】의 주요 인물 설정은 100% 준수하되, 단역(상인, 점소이, 왈패 등)은 자유롭게 창작하세요.
- 세계관의 절대 규칙은 지키되, 자잘한 디테일(객잔명, 마을명 등)은 자연스럽게 창작하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

/**
 * 슬라이딩 윈도우 컨텍스트를 프롬프트 문자열로 직렬화
 */
export function serializeContextToPrompt(context: SlidingWindowContext): string {
  const sections: string[] = [];

  // 1. World Bible (세계관 절대 규칙)
  if (context.worldBible) {
    const wb = context.worldBible;
    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                              【세계관 설정】
═══════════════════════════════════════════════════════════════════════════════

▶ 세계관 이름: ${wb.world_name || '미설정'}
▶ 시대/배경: ${wb.time_period || '미설정'}
▶ 지리: ${wb.geography || '미설정'}

▶ 힘의 체계: ${wb.power_system_name || '없음'}
${wb.power_system_rules || ''}

▶ 절대 규칙 (이것만은 절대 어기면 안 됨):
${formatAbsoluteRules(wb.absolute_rules)}

▶ 금기 사항 (절대 하면 안 되는 것):
${wb.forbidden_elements?.length ? wb.forbidden_elements.map((f: string) => `- ${f}`).join('\n') : '- 없음'}
`);
  }

  // 2. 직전 회차 요약 (Memory Context)
  if (context.recentLogs && context.recentLogs.length > 0) {
    const logSummaries = context.recentLogs
      .slice()
      .reverse() // 오래된 순으로 정렬
      .map(log => {
        const fallbackNote = log.isFallback ? ' (임시 요약)' : '';
        return `【${log.episodeNumber}화${fallbackNote}】
${log.summary}`;
      })
      .join('\n\n');

    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                            【직전 회차 요약】
═══════════════════════════════════════════════════════════════════════════════

${logSummaries}
`);
  }

  // 3. 문맥 연결 앵커 (직전 회차 마지막 장면)
  if (context.lastSceneAnchor) {
    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                         【직전 회차 마지막 장면】
═══════════════════════════════════════════════════════════════════════════════

"""
${context.lastSceneAnchor}
"""

⚠️ 위 장면에서 자연스럽게 이어서 시작하세요. 시간/장소가 급격히 바뀌면 안 됩니다.
`);
  }

  // 4. 캐릭터 정보 (기본 정보 + 현재 상태)
  if (context.activeCharacters && context.activeCharacters.length > 0) {
    const charDetails = context.activeCharacters
      .map(c => {
        const roleLabel = c.role === 'protagonist' ? '주인공' :
                         c.role === 'antagonist' ? '악역' :
                         c.role === 'supporting' ? '조연' : '기타';

        const lines: string[] = [];
        lines.push(`▶ ${c.name} [${roleLabel}]${!c.isAlive ? ' ⚠️ 사망' : ''}`);

        // 기본 정보 (성격, 배경, 말투 - 이것이 핵심!)
        if (c.personality) lines.push(`   • 성격: ${c.personality}`);
        if (c.backstory) lines.push(`   • 배경: ${c.backstory}`);
        if (c.speechPattern) lines.push(`   • 말투: ${c.speechPattern}`);
        if (c.appearance) lines.push(`   • 외모: ${c.appearance}`);
        if (c.goals && c.goals.length > 0) lines.push(`   • 목표: ${c.goals.join(', ')}`);

        // 현재 상태
        const currentStatus: string[] = [];
        if (c.currentLocation) currentStatus.push(`위치: ${c.currentLocation}`);
        if (c.emotionalState) currentStatus.push(`감정: ${c.emotionalState}`);
        if (c.injuries && c.injuries.length > 0) currentStatus.push(`부상: ${c.injuries.join(', ')}`);
        if (c.possessedItems && c.possessedItems.length > 0) currentStatus.push(`소지품: ${c.possessedItems.join(', ')}`);

        if (currentStatus.length > 0) {
          lines.push(`   • 현재상태: ${currentStatus.join(' | ')}`);
        }

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                          【주요 등장인물】
═══════════════════════════════════════════════════════════════════════════════

⚠️ 아래 주요 인물들의 성격, 배경, 말투는 반드시 준수하세요.
💡 단역(상인, 점소이, 부하 등)은 세계관에 맞게 자유롭게 창작 가능합니다.

${charDetails}
`);
  }

  // 5. 미해결 떡밥
  if (context.unresolvedHooks && context.unresolvedHooks.length > 0) {
    const hooks = context.unresolvedHooks
      .map(h => `- [${h.createdInEpisodeNumber}화, 중요도 ${h.importance}/10] ${h.summary}`)
      .join('\n');

    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                        【미해결 떡밥 목록】
═══════════════════════════════════════════════════════════════════════════════

필요하다면 아래 떡밥 중 일부를 이번 회차에서 회수할 수 있습니다:

${hooks}
`);
  }

  // 6. 장기 기억 검색 결과
  if (context.longTermMemories && context.longTermMemories.length > 0) {
    const memories = context.longTermMemories
      .map(m => `- [${m.sourceEpisodeNumber || '?'}화] ${m.characterName}: ${m.memorySummary}`)
      .join('\n');

    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                         【관련 장기 기억】
═══════════════════════════════════════════════════════════════════════════════

과거 회차에서 검색된 관련 정보입니다. 연속성 유지에 참고하세요:

${memories}
`);
  }

  // 7. 학습된 문체 선호도
  if (context.writingPreferences && context.writingPreferences.length > 0) {
    const prefs = context.writingPreferences
      .map(p => {
        const parts: string[] = [];
        if (p.preferenceSummary) parts.push(p.preferenceSummary);
        if (p.favorPatterns && p.favorPatterns.length > 0) parts.push(`선호: ${p.favorPatterns.join(', ')}`);
        if (p.avoidPatterns && p.avoidPatterns.length > 0) parts.push(`회피: ${p.avoidPatterns.join(', ')}`);
        return `- ${parts.join(' / ')}`;
      })
      .join('\n');

    sections.push(`
═══════════════════════════════════════════════════════════════════════════════
                       【PD님의 문체 선호도】
═══════════════════════════════════════════════════════════════════════════════

이전 피드백에서 학습된 문체 선호도입니다. 이 스타일을 반영해주세요:

${prefs}
`);
  }

  return sections.join('\n');
}

/**
 * absolute_rules JSON을 포맷팅
 */
function formatAbsoluteRules(rules: unknown): string {
  if (!rules) return '- 없음';

  if (Array.isArray(rules)) {
    return rules.map((r, i) => `${i + 1}. ${typeof r === 'string' ? r : JSON.stringify(r)}`).join('\n');
  }

  if (typeof rules === 'object') {
    return Object.entries(rules as Record<string, unknown>)
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');
  }

  return String(rules);
}

/**
 * 에피소드 생성용 전체 프롬프트 조립
 */
export function buildEpisodeGenerationPrompts(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): { systemPrompt: string; userPrompt: string } {
  const contextPrompt = serializeContextToPrompt(context);

  // Writing Memory (학습된 문체 규칙) 주입
  const writingMemoryPrompt = buildWritingMemoryPrompt();

  // 시스템 프롬프트 = 기본 페르소나 + 학습된 문체 규칙
  const systemPrompt = COMMERCIAL_WRITER_SYSTEM_PROMPT + '\n' + writingMemoryPrompt;

  const userPrompt = `${contextPrompt}

═══════════════════════════════════════════════════════════════════════════════
                           【이번 회차 지시사항】
═══════════════════════════════════════════════════════════════════════════════

▶ 작성할 회차: ${targetEpisodeNumber}화

▶ PD님의 요청:
${userInstruction}

═══════════════════════════════════════════════════════════════════════════════
                              【출력 형식】
═══════════════════════════════════════════════════════════════════════════════

- 에피소드 본문만 출력하세요.
- 제목, 회차 번호, 메타 정보, 작가의 말 등은 포함하지 마세요.
- 순수 본문만 작성합니다.
- 분량: 4,000자 ~ 6,000자 (공백 포함)

이제 ${targetEpisodeNumber}화를 작성해주세요.`;

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * 로그 압축용 프롬프트 조립
 */
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

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * 피드백 분석용 프롬프트 조립
 */
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

  return {
    systemPrompt,
    userPrompt,
  };
}

/**
 * @deprecated 이 함수는 테스트 목적으로만 사용되어야 합니다.
 * 실제 서비스에서는 절대 사용하지 마세요!
 * 반드시 buildSlidingWindowContext()를 통해 실제 DB 데이터를 사용하세요.
 *
 * 테스트용 더미 컨텍스트 생성 - 하드코딩된 가짜 데이터
 * ⚠️ 이 데이터는 실제 프로젝트 데이터가 아닙니다!
 */
export function createTestContext(): SlidingWindowContext {
  console.warn('[DEPRECATED] createTestContext() 사용됨 - 실제 DB 데이터가 아닌 하드코딩된 테스트 데이터입니다!');
  console.warn('[DEPRECATED] 실제 서비스에서는 buildSlidingWindowContext()를 사용하세요.');

  return {
    worldBible: {
      id: 'test-world-bible',
      project_id: 'test-project',
      world_name: '검황전설의 세계',
      time_period: '가상의 고대 무협 시대',
      geography: '중원을 중심으로 한 대륙, 강호가 존재하는 세계',
      power_system_name: '내공 체계',
      power_system_ranks: ['입문', '후천', '선천', '화경', '귀원', '현경', '신경'],
      power_system_rules: '내공은 단전에 축적되며, 경지가 올라갈수록 수명이 연장된다.',
      absolute_rules: [
        '죽은 자는 되살아나지 않는다',
        '신경 이상의 고수는 현재 중원에 3명뿐이다',
        '천잠비급은 전설의 무공으로 실존 여부가 불확실하다',
      ],
      forbidden_elements: ['시간여행', '현대 문물', '주인공 사망'],
      additional_settings: {},
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    recentLogs: [
      {
        episodeNumber: 1,
        summary: '무명의 청년 검사 이청운이 멸문당한 사문의 유일한 생존자로 밝혀진다. 복수를 다짐하며 강호에 첫발을 내딛는다.',
        last500Chars: '...이청운은 스승님의 무덤 앞에서 무릎을 꿇었다.\n\n"반드시... 반드시 원수를 찾아 복수하겠습니다."\n\n그의 눈에서 한 줄기 눈물이 흘러내렸다. 하지만 그 눈물 속에는 슬픔만이 아닌, 타오르는 분노가 서려 있었다.\n\n청운은 천천히 일어섰다. 이제 더 이상 나약한 제자가 아니었다. 복수를 위해 강해져야 했다.\n\n등 뒤로 차가운 바람이 불어왔다. 마치 그의 앞길을 예고하듯이.',
        isFallback: false,
      },
    ],
    lastSceneAnchor: '등 뒤로 차가운 바람이 불어왔다. 마치 그의 앞길을 예고하듯이.',
    activeCharacters: [
      {
        id: 'char-1',
        name: '이청운',
        role: 'protagonist',
        isAlive: true,
        currentLocation: '청풍파 폐허',
        emotionalState: '비통함, 복수심',
        injuries: [],
        possessedItems: ['낡은 검 한 자루', '스승의 유품 옥패'],
      },
    ],
    unresolvedHooks: [
      {
        id: 'hook-1',
        hookType: 'mystery',
        summary: '청풍파를 멸문시킨 세력의 정체가 아직 밝혀지지 않음',
        importance: 10,
        createdInEpisodeNumber: 1,
        keywords: ['멸문', '원수', '미스터리'],
      },
    ],
    writingPreferences: [],
    longTermMemories: undefined,
  };
}

// Legacy exports for backward compatibility
export function buildEpisodeGenerationPrompt(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): string {
  const { systemPrompt, userPrompt } = buildEpisodeGenerationPrompts(
    context,
    userInstruction,
    targetEpisodeNumber
  );
  return `${systemPrompt}\n\n${userPrompt}`;
}

export function buildLogCompressionPrompt(episodeContent: string): string {
  const { systemPrompt, userPrompt } = buildLogCompressionPrompts(episodeContent);
  return `${systemPrompt}\n\n${userPrompt}`;
}

export function buildFeedbackAnalysisPrompt(
  originalText: string,
  editedText: string
): string {
  const { systemPrompt, userPrompt } = buildFeedbackAnalysisPrompts(
    originalText,
    editedText
  );
  return `${systemPrompt}\n\n${userPrompt}`;
}
