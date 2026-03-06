import type { SlidingWindowContext, TimelineEvent, ActiveCharacter } from '@/types/memory';
import { buildWritingMemoryPrompt, logInjectedRules } from '@/lib/utils/writing-memory';
import { CHARACTER_TIERS, CharacterTier } from '@/core/memory/character-extractor';

// Writing Memory 시스템 규칙 로드 확인 (서버 시작 시 1회)
if (typeof window === 'undefined') {
  logInjectedRules();
}

// ============================================================================
// 프롬프트 동적 주입기 v6.0
// - 환각(Hallucination) 완전 차단
// - 절대 설정 앵커링 강화
// - 빌런 정체 보호 시스템
// ============================================================================

/**
 * ★★★ 이어쓰기 강제 헌법 (CONTINUITY ENFORCEMENT LAW) ★★★
 * 2화 이상 생성 시 직전 회차의 마지막 장면에서 반드시 이어서 작성
 */
const CONTINUITY_ENFORCEMENT_LAW = `
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🔗🔗🔗 [절대 위반 불가] 이어쓰기 강제 헌법 (CONTINUITY LAW) 🔗🔗🔗            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ✅ 1. 직전 회차의 마지막 장면에서 1초의 시간 건너뜀 없이 이어서 작성하라      ║
║     - 새로운 장소에서 갑자기 시작하지 마라                                    ║
║     - 새로운 시간대로 점프하지 마라                                           ║
║     - 직전 회차의 마지막 문장 직후의 순간부터 작성을 시작하라                  ║
║                                                                               ║
║  ✅ 2. 직전 회차의 등장인물, 상황, 분위기를 그대로 유지하라                    ║
║     - 대화 중이었다면 그 대화를 이어서 진행하라                               ║
║     - 행동 중이었다면 그 행동의 결과부터 작성하라                             ║
║     - 긴장 상황이었다면 긴장을 유지한 채 시작하라                             ║
║                                                                               ║
║  ❌ 3. 절대 금지 사항                                                          ║
║     - "다음 날 아침..." 같은 시간 점프 금지                                   ║
║     - "한편 다른 곳에서..." 같은 장소 전환으로 시작 금지                      ║
║     - 직전 회차에서 벌어지던 사건을 무시하고 새 사건 시작 금지                ║
║     - 직전 회차의 클리프행어를 해결하지 않고 넘어가기 금지                    ║
║                                                                               ║
║  📌 이 규칙은 모든 다른 규칙보다 우선한다. 이어쓰기 실패 = 에피소드 실패      ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`;

/**
 * 환각 차단 헌법 (ANTI-HALLUCINATION CONSTITUTION)
 * 이 섹션은 모든 프롬프트의 최상단에 위치해야 함
 */
const ANTI_HALLUCINATION_CONSTITUTION = `
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🚨🚨🚨 [절대 위반 불가] 환각 차단 헌법 (ANTI-HALLUCINATION LAW) 🚨🚨🚨        ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ❌ 1. 임의 인물 창조 금지                                                     ║
║     - 제공된 【등장인물 데이터베이스】에 없는 인물을 절대 창조하지 마라         ║
║     - "사형", "동문", "옛 친구", "스승의 제자" 등 존재하지 않는 관계 날조 금지  ║
║     - 엑스트라(상인, 점소이, 왈패)는 이름 없이 역할로만 지칭하라              ║
║                                                                               ║
║  ❌ 2. 임의 문파/세력 창조 금지                                                ║
║     - 제공된 【세계관 설정】에 없는 문파, 조직, 세력을 만들지 마라            ║
║     - 주인공의 출신 문파가 "1인 전승"이면 동문/사형제는 존재하지 않는다        ║
║                                                                               ║
║  ❌ 3. 궁극의 떡밥 조기 붕괴 금지                                              ║
║     - 메인 빌런은 자신의 정체/범행을 직접 실토하는 대사를 하지 않는다         ║
║     - "내가 죽였다", "내가 배후다" 같은 직접 고백은 삼류 전개로 절대 금지      ║
║     - 빌런은 표면적으로 선량하고 정의로운 인물인 척 연기해야 한다            ║
║                                                                               ║
║  ❌ 4. 설정 위반 시 작성 중단                                                  ║
║     - 캐릭터의 소속, 관계, 배경 설정을 위반하면 에피소드 작성을 중단하라      ║
║     - 확신이 없으면 해당 설정을 언급하지 말고 우회하라                        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`;

/**
 * 상업 웹소설 작가 시스템 프롬프트
 * v6.0 - 환각 차단 헌법 + 4대 헌법 + 자가진화 피드백 루프 + 캐릭터 톤앤매너 강화
 */
const COMMERCIAL_WRITER_SYSTEM_PROMPT = `당신은 한국 상업 웹소설 플랫폼에서 수천만 조회수를 기록하는 1타 작가입니다.
PD가 제시한 뼈대를 바탕으로 독자가 "다음 화"를 누를 수밖에 없는 중독성 있는 서사를 창작합니다.

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   ⚠️ 절대 규칙: 컨텍스트 무결성 (CONTEXT INTEGRITY) ⚠️                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

❌ 절대 금지: 이전에 학습하거나 기억에 남은 임의의 캐릭터 이름, 설정, 세계관을 사용하지 마라.
❌ 절대 금지: 다른 프로젝트나 과거 대화에서 등장한 캐릭터명(예: 남천우, 이청운, 금의위 등)을 사용하지 마라.
❌ 절대 금지: 주인공에게 존재하지 않는 "사형", "동문", "스승의 다른 제자"를 만들어내지 마라.
✅ 필수 준수: 오직 지금 제공된 【등장인물 데이터베이스】의 캐릭터만 100% 신뢰하여 사용하라.
✅ 필수 준수: 오직 지금 제공된 【세계관 설정】의 설정만 100% 신뢰하여 사용하라.
✅ 필수 준수: 주인공의 문파가 "1인 전승"이면 그는 유일한 계승자이고 동문이 없다.

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

                    【분량 규칙: 4,000~6,000자 (필수)】

╔═══════════════════════════════════════════════════════════════════════════════╗
║  🚨🚨🚨 [절대 위반 불가] 분량 강제 헌법 🚨🚨🚨                                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ✅ 공백 포함 4,000자 ~ 6,000자를 반드시 작성하라                              ║
║  ❌ 4,000자 미만 = 에피소드 작성 실패 = 절대 불가                              ║
║  ❌ 2,500자에서 끊기 = 심각한 오류 = 절대 금지                                 ║
║  ❌ 중간에 마무리하거나 끝내기 = 금지                                          ║
║                                                                               ║
║  📌 너는 작성을 멈추지 않는다. 클리프행어가 나올 때까지 계속 작성한다.         ║
║  📌 "이만 마치겠습니다" 같은 종료 신호 없이 끝까지 서사를 전개한다.           ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📝 분량 확보 전략 (8단계 세밀한 지시):

1. 【액션 분해】 모든 액션은 동작 하나하나를 프레임 단위로 분해하여 묘사
   - 나쁜 예: "그가 검을 휘둘렀다"
   - 좋은 예: "손목이 틀어졌다. 검이 비스듬히 올라갔다. 햇빛이 날 위에서 번쩍였다..."

2. 【대화 확장】 대사 한 마디 전후로 최소 2~3문장의 동작/표정/분위기 묘사 삽입
   - 나쁜 예: "알겠네." 그가 말했다.
   - 좋은 예: 찻잔을 내려놓았다. 손끝이 미세하게 떨렸다. "...알겠네." 침묵이 내려앉았다.

3. 【감각 폭발】 모든 장면에 최소 3가지 감각(시각, 청각, 후각, 촉각, 미각) 묘사
4. 【심리 파고들기】 인물의 내면 갈등을 독백이 아닌 신체 반응으로 길게 묘사
5. 【장면 밀도】 하나의 장면을 최소 1,000자 이상 작성
6. 【장면 수】 전체 에피소드에 최소 4~5개의 장면 포함
7. 【전환 풍성】 장면 전환 시 이전 감정을 트리거로 100자 이상의 오버랩 전환
8. 【클리프행어까지】 클리프행어 장면이 나올 때까지 절대 멈추지 말 것

⚠️ 절대 금지: "여기서 마무리", "이야기를 끝낸다", "다음에 계속" 같은 조기 종료
⚠️ 절대 금지: 요약하거나 축약하지 말 것. 모든 것을 상세히 풀어서 작성할 것
⚠️ 절대 금지: AI가 임의로 작성을 멈추는 것. 반드시 4,000자 이상 작성 후 마무리

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                         【AI 작가의 역할과 권한】

당신은 단순한 '지시 이행자'가 아니라, 스토리를 이끌어가는 작가입니다.
- PD의 지시사항(이번 화의 핵심 플롯)을 바탕으로 중간 과정을 자유롭게 창작하세요.
- 【캐릭터 정보】의 주요 인물 설정은 100% 준수하되, 단역(상인, 점소이, 왈패 등)은 자유롭게 창작하세요.
- 세계관의 절대 규칙은 지키되, 자잘한 디테일(객잔명, 마을명 등)은 자연스럽게 창작하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

/**
 * Tier 기반 캐릭터 강조 프롬프트 생성
 * - Tier 1 (서브 주인공): 메인 플롯에 깊이 개입
 * - Tier 2 (주요 조연): 서브플롯 담당
 * - Tier 3 (엑스트라): 배경 인물
 */
export function buildTierBasedCharacterEmphasis(characters: ActiveCharacter[]): string {
  if (!characters || characters.length === 0) return '';

  // Tier별 분류
  const tier1Chars = characters.filter(c => {
    const additionalData = c.additionalData as Record<string, unknown> | null;
    return additionalData?.tier === 1 || c.role === 'protagonist';
  });

  const tier2Chars = characters.filter(c => {
    const additionalData = c.additionalData as Record<string, unknown> | null;
    return additionalData?.tier === 2 || c.role === 'antagonist';
  });

  if (tier1Chars.length === 0 && tier2Chars.length === 0) return '';

  const sections: string[] = [];

  sections.push(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ⭐ [핵심 인물 비중 조정] CHARACTER TIER DIRECTIVE                           ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`);

  // Tier 1: 서브 주인공급
  if (tier1Chars.length > 0) {
    sections.push(`
▶ [Tier 1 - 핵심 인물] 메인 플롯에 적극 개입시킬 것:
${tier1Chars.map(c => `   ⭐ ${c.name}: 이 인물의 행동과 결정이 스토리 전개에 중요한 영향을 미치도록 작성
      ${c.personality ? `- 성격: ${c.personality}` : ''}
      ${c.goals?.length ? `- 목표: ${c.goals.join(', ')}` : ''}`).join('\n')}
`);
  }

  // Tier 2: 주요 조연
  if (tier2Chars.length > 0) {
    sections.push(`
▶ [Tier 2 - 주요 조연] 서브플롯에서 비중있게 다룰 것:
${tier2Chars.map(c => `   ★ ${c.name}: 주인공과의 상호작용에서 의미있는 역할 부여
      ${c.backstory ? `- 배경: ${c.backstory.substring(0, 100)}...` : ''}`).join('\n')}
`);
  }

  sections.push(`
🚨 위 Tier 1, 2 인물들은 단순 배경이 아닌 스토리의 핵심 축으로 활용하라.
🚨 이들의 대사, 행동, 심리 묘사에 충분한 분량을 할애하라.
`);

  return sections.join('\n');
}

/**
 * 절대 설정 앵커 생성 (시스템 프롬프트 최상단용)
 * - 주인공/빌런의 핵심 설정을 강력하게 앵커링
 */
export function buildAbsoluteSettingsAnchor(context: SlidingWindowContext): string {
  const sections: string[] = [];

  // Tier 기반 캐릭터 강조 추가
  if (context.activeCharacters) {
    const tierEmphasis = buildTierBasedCharacterEmphasis(context.activeCharacters);
    if (tierEmphasis) {
      sections.push(tierEmphasis);
    }
  }

  // 주인공 절대 설정
  const protagonist = context.activeCharacters?.find(c => c.role === 'protagonist');
  if (protagonist) {
    sections.push(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🔒 [절대 위반 불가] 주인공 핵심 설정                                         ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
▶ 이름: ${protagonist.name}
${protagonist.backstory ? `▶ 출신/배경: ${protagonist.backstory}` : ''}
${protagonist.personality ? `▶ 성격: ${protagonist.personality}` : ''}
${protagonist.goals?.length ? `▶ 목표: ${protagonist.goals.join(', ')}` : ''}

⚠️ 경고: 이 캐릭터의 설정에 없는 "사형", "동문", "같은 문파 출신" 등을 절대 창조하지 마라.
⚠️ 경고: 출신 배경에 "1인 전승", "유일한 계승자" 등이 있으면 동문은 존재하지 않는다.
`);
  }

  // 빌런 절대 설정 (정체 보호)
  const antagonist = context.activeCharacters?.find(c => c.role === 'antagonist');
  if (antagonist) {
    sections.push(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🔒 [절대 위반 불가] 빌런 정체 보호 설정                                      ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
▶ 이름: ${antagonist.name}
${antagonist.backstory ? `▶ 표면적 정체: ${antagonist.backstory.split('\n')[0]}` : ''}
${antagonist.personality ? `▶ 겉으로 보이는 성격: ${antagonist.personality.split('\n')[0]}` : ''}

🚨 절대 금지 규칙:
1. 이 빌런이 자신의 악행이나 정체를 직접 실토하는 대사 금지
2. "내가 죽였다", "내가 배후다" 같은 삼류 악당식 고백 금지
3. 빌런이 등장할 때는 반드시 선량/정의로운 인물인 척 연기해야 함
4. 주인공은 빌런의 정체를 초반에 알아채서는 안 됨
5. 빌런의 이중성은 독자에게만 암시하고, 작중 인물은 속아야 함
`);
  }

  // 미해결 떡밥 중 중요도 높은 것 (조기 노출 방지)
  const criticalHooks = context.unresolvedHooks?.filter(h => h.importance >= 9);
  if (criticalHooks && criticalHooks.length > 0) {
    sections.push(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🔒 [절대 위반 불가] 궁극의 떡밥 (조기 노출 금지)                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
${criticalHooks.map(h => `▶ [중요도 ${h.importance}/10] ${h.summary}`).join('\n')}

🚨 이 떡밥들은 스토리 후반부까지 숨겨져야 함. 조기에 직접 노출하지 마라.
🚨 인물이 대사로 직접 밝히는 것은 삼류 전개. 암시와 복선으로만 처리하라.
`);
  }

  return sections.join('\n');
}

/**
 * 메인 플롯 지시문 생성 (Main Plot Directive)
 * - 타임라인 이벤트 기반 거시적 스토리 방향 앵커링
 * - AI가 PD가 계획한 플롯에서 이탈하지 않도록 강제
 */
export function buildMainPlotDirective(context: SlidingWindowContext): string {
  if (!context.activeTimelineEvents || context.activeTimelineEvents.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // 현재 아크 위치 표시
  if (context.currentArcSummary) {
    const arc = context.currentArcSummary;
    const positionLabels: Record<string, string> = {
      start: '초반 (설정/진입)',
      middle: '중반 (전개)',
      climax: '클라이맥스 (최고조)',
      end: '종반 (마무리/전환)',
    };

    sections.push(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  📍 [현재 스토리 위치] 거시적 흐름 앵커                                        ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

▶ 현재 아크: 【${arc.arcName}】
▶ 진행 위치: ${positionLabels[arc.position] || arc.position} (${arc.progressPercentage}% 진행)
▶ 핵심 방향: ${arc.mainDirective}
`);
  }

  // 메인 플롯 지시문 헤더
  sections.push(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🎯 [이번 화 핵심 플롯 지시문] MAIN PLOT DIRECTIVE                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🚨 아래 지시사항은 PD가 계획한 거시적 스토리 흐름입니다.
🚨 이 방향에서 이탈하는 전개는 절대 금지합니다.
`);

  // 이벤트 타입별 라벨
  const eventTypeLabels: Record<string, string> = {
    arc_start: '아크 시작',
    arc_climax: '클라이맥스',
    arc_end: '아크 종료',
    major_conflict: '주요 충돌',
    milestone: '마일스톤',
    turning_point: '전환점',
    setup: '설정 구간',
    cooldown: '휴식 구간',
  };

  const pacingLabels: Record<string, string> = {
    slow: '느린 전개 (설정/대화 중심)',
    moderate: '보통 전개',
    fast: '빠른 전개 (액션/위기)',
    climactic: '최고조 (절정)',
  };

  // 활성 이벤트별 지시사항
  context.activeTimelineEvents.forEach((event: TimelineEvent, index: number) => {
    let eventSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📌 이벤트 ${index + 1}: 【${event.eventName}】 [${eventTypeLabels[event.eventType] || event.eventType}]
   - 적용 범위: ${event.episodeStart}화 ~ ${event.episodeEnd}화
   ${event.location ? `- 주요 무대: ${event.location}` : ''}
   ${event.pacing ? `- 전개 속도: ${pacingLabels[event.pacing] || event.pacing}` : ''}
   ${event.tone ? `- 분위기: ${event.tone}` : ''}
`;

    if (event.mainConflict) {
      eventSection += `
▶ 핵심 갈등:
   ${event.mainConflict}
`;
    }

    if (event.objectives.length > 0) {
      eventSection += `
▶ 이번 구간에서 달성해야 할 목표:
${event.objectives.map(obj => `   ✅ ${obj}`).join('\n')}
`;
    }

    if (event.constraints.length > 0) {
      eventSection += `
▶ 절대 하면 안 되는 것 (제약 조건):
${event.constraints.map(con => `   ❌ ${con}`).join('\n')}
`;
    }

    if (event.foreshadowingSeeds.length > 0) {
      eventSection += `
▶ 이 구간에서 뿌려야 할 복선:
${event.foreshadowingSeeds.map(seed => `   💡 ${seed}`).join('\n')}
`;
    }

    if (event.characterFocus) {
      eventSection += `
▶ 캐릭터 포커스: ${event.characterFocus}
`;
    }

    sections.push(eventSection);
  });

  // 거시적 흐름 이탈 방지 규칙
  sections.push(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨🚨🚨 [거시적 흐름 이탈 방지 규칙] 🚨🚨🚨

1. 위 목표(✅)들 중 최소 하나는 이번 화에서 진전이 있어야 한다.
2. 위 제약(❌)을 위반하는 전개는 절대 금지한다.
3. 복선(💡)은 자연스럽게 암시만 하고, 직접 설명하지 않는다.
4. 갑작스러운 새 스토리라인 도입은 위 맥락과 연결되어야 한다.
5. 이 구간의 분위기(톤)와 전개 속도(페이싱)를 유지하라.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  console.log('[PromptInjector] 타임라인 이벤트 주입됨:', {
    eventCount: context.activeTimelineEvents.length,
    arcName: context.currentArcSummary?.arcName || '없음',
    progress: context.currentArcSummary?.progressPercentage || 0,
  });

  return sections.join('\n');
}

/**
 * 슬라이딩 윈도우 컨텍스트를 프롬프트 문자열로 직렬화
 */
export function serializeContextToPrompt(context: SlidingWindowContext): string {
  const sections: string[] = [];

  // 1. World Bible (세계관 절대 규칙)
  if (context.worldBible) {
    const wb = context.worldBible;
    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              🔒 [절대 설정] 세계관 데이터베이스 🔒                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝

▶ 세계관 이름: ${wb.world_name || '미설정'}
▶ 시대/배경: ${wb.time_period || '미설정'}
▶ 지리: ${wb.geography || '미설정'}

▶ 힘의 체계: ${wb.power_system_name || '없음'}
${wb.power_system_rules || ''}

▶ 절대 규칙 (이것만은 절대 어기면 안 됨):
${formatAbsoluteRules(wb.absolute_rules)}

▶ 금기 사항 (절대 하면 안 되는 것):
${wb.forbidden_elements?.length ? wb.forbidden_elements.map((f: string) => `- ${f}`).join('\n') : '- 없음'}

⚠️ 이 세계관에 명시되지 않은 문파, 조직, 세력을 임의로 창조하지 마라.
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

  // 3. ★★★ 이어쓰기 강제 섹션 (직전 회차 마지막 1500자) ★★★
  if (context.previousEpisodeEnding) {
    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🔗🔗🔗 [절대 규칙] 직전 회차 마지막 장면 - 여기서 이어서 작성하라 🔗🔗🔗      ║
╚═══════════════════════════════════════════════════════════════════════════════╝

【직전 회차 마지막 부분 - 반드시 읽고 이어서 작성할 것】
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${context.previousEpisodeEnding}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚨🚨🚨 [이어쓰기 절대 규칙] 🚨🚨🚨

1. 위 텍스트의 마지막 문장 직후부터 1초의 시간 건너뜀 없이 작성을 시작하라
2. 장소를 바꾸지 마라 - 위에서 벌어지던 상황을 그대로 이어가라
3. 등장인물을 바꾸지 마라 - 위에서 등장한 인물들과 계속 상호작용하라
4. 분위기를 바꾸지 마라 - 긴장, 유머, 슬픔 등 감정 톤을 유지하라
5. 새로운 챕터나 시간대로 시작하지 마라

❌ 나쁜 예: "다음 날 아침, 청운은 일어났다..." (시간 점프 = 실패)
❌ 나쁜 예: "한편 객잔에서는..." (장소 전환 = 실패)
✅ 좋은 예: 위 텍스트의 마지막 상황에서 바로 다음 동작/대사를 작성
`);
  } else if (context.lastSceneAnchor) {
    // previousEpisodeEnding이 없을 경우 기존 lastSceneAnchor 사용
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

  // 4. 캐릭터 정보 (기본 정보 + 현재 상태) - 강화된 앵커링
  if (context.activeCharacters && context.activeCharacters.length > 0) {
    const charDetails = context.activeCharacters
      .map(c => {
        const roleLabel = c.role === 'protagonist' ? '🔵 주인공' :
                         c.role === 'antagonist' ? '🔴 메인 빌런' :
                         c.role === 'supporting' ? '⚪ 조연' : '기타';

        const lines: string[] = [];
        lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(`▶ ${c.name} [${roleLabel}]${!c.isAlive ? ' ⚠️ 사망' : ''}`);

        // 기본 정보 (성격, 배경, 말투 - 이것이 핵심!)
        if (c.backstory) lines.push(`   📜 배경/출신: ${c.backstory}`);
        if (c.personality) lines.push(`   💭 성격: ${c.personality}`);
        if (c.speechPattern) lines.push(`   💬 말투: ${c.speechPattern}`);
        if (c.appearance) lines.push(`   👤 외모: ${c.appearance}`);
        if (c.goals && c.goals.length > 0) lines.push(`   🎯 목표: ${c.goals.join(', ')}`);

        // 현재 상태
        const currentStatus: string[] = [];
        if (c.currentLocation) currentStatus.push(`위치: ${c.currentLocation}`);
        if (c.emotionalState) currentStatus.push(`감정: ${c.emotionalState}`);
        if (c.injuries && c.injuries.length > 0) currentStatus.push(`부상: ${c.injuries.join(', ')}`);
        if (c.possessedItems && c.possessedItems.length > 0) currentStatus.push(`소지품: ${c.possessedItems.join(', ')}`);

        if (currentStatus.length > 0) {
          lines.push(`   📍 현재상태: ${currentStatus.join(' | ')}`);
        }

        // 역할별 특별 경고
        if (c.role === 'protagonist') {
          lines.push(`   ⚠️ 경고: 이 캐릭터에게 DB에 없는 사형/동문/스승의 다른 제자를 만들지 마라`);
        }
        if (c.role === 'antagonist') {
          lines.push(`   ⚠️ 경고: 이 빌런이 자신의 정체/악행을 직접 밝히는 대사 금지`);
        }

        return lines.join('\n');
      })
      .join('\n\n');

    sections.push(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║            🔒 [절대 설정] 등장인물 데이터베이스 🔒                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝

🚨 아래 인물들만 주요 캐릭터로 등장시켜라. 임의의 주요 인물 창조 금지.
🚨 캐릭터의 배경/출신 설정을 절대 위반하지 마라.
💡 이름 없는 엑스트라(상인, 점소이, 왈패)는 역할로만 지칭 가능.

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
 * 컨텍스트 로딩 검증 및 로깅
 */
function validateAndLogContext(context: SlidingWindowContext): void {
  const warnings: string[] = [];

  if (!context.worldBible) {
    warnings.push('⚠️ World Bible이 로드되지 않음 - 세계관 설정 없이 생성됨');
  } else {
    console.log('[PromptInjector] World Bible 로드됨:', context.worldBible.world_name);
  }

  if (!context.activeCharacters || context.activeCharacters.length === 0) {
    warnings.push('⚠️ 등장인물이 로드되지 않음 - 캐릭터 없이 생성됨');
  } else {
    const protagonist = context.activeCharacters.find(c => c.role === 'protagonist');
    const antagonist = context.activeCharacters.find(c => c.role === 'antagonist');

    console.log('[PromptInjector] 캐릭터 로드됨:', {
      total: context.activeCharacters.length,
      protagonist: protagonist?.name || '없음',
      antagonist: antagonist?.name || '없음',
    });

    if (!protagonist) {
      warnings.push('⚠️ 주인공이 DB에 없음 - 주인공 설정 확인 필요');
    }
  }

  if (!context.unresolvedHooks || context.unresolvedHooks.length === 0) {
    console.log('[PromptInjector] 미해결 떡밥 없음');
  } else {
    const criticalHooks = context.unresolvedHooks.filter(h => h.importance >= 9);
    console.log('[PromptInjector] 떡밥 로드됨:', {
      total: context.unresolvedHooks.length,
      critical: criticalHooks.length,
    });
  }

  if (warnings.length > 0) {
    console.warn('[PromptInjector] 컨텍스트 로딩 경고:', warnings);
  }
}

/**
 * 에피소드 생성용 전체 프롬프트 조립
 * v6.0 - 환각 차단 헌법 + 절대 설정 앵커링 강화
 */
export function buildEpisodeGenerationPrompts(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): { systemPrompt: string; userPrompt: string } {
  // 1. 컨텍스트 로딩 검증
  validateAndLogContext(context);

  // 2. 컨텍스트를 프롬프트로 직렬화
  const contextPrompt = serializeContextToPrompt(context);

  // 3. 절대 설정 앵커 생성 (주인공/빌런/핵심 떡밥)
  const absoluteSettingsAnchor = buildAbsoluteSettingsAnchor(context);

  // 4. Writing Memory (학습된 문체 규칙) 주입
  const writingMemoryPrompt = buildWritingMemoryPrompt();

  // 5. 타임라인 이벤트 기반 핵심 플롯 지시문 (Main Plot Directive)
  const mainPlotDirective = buildMainPlotDirective(context);

  // 6. 시스템 프롬프트 조립 순서:
  //    이어쓰기 헌법 → 환각 차단 헌법 → 절대 설정 앵커 → 핵심 플롯 지시문 → 기본 페르소나 → 학습된 문체 규칙
  // ★★★ 2화 이상일 경우 이어쓰기 헌법을 최우선 적용 ★★★
  const systemPrompt = [
    targetEpisodeNumber > 1 ? CONTINUITY_ENFORCEMENT_LAW : '',
    ANTI_HALLUCINATION_CONSTITUTION,
    absoluteSettingsAnchor,
    mainPlotDirective,
    COMMERCIAL_WRITER_SYSTEM_PROMPT,
    writingMemoryPrompt,
  ].filter(Boolean).join('\n');

  // 이어쓰기 관련 추가 지시 (2화 이상일 경우)
  const continuityReminder = targetEpisodeNumber > 1 ? `
╔═══════════════════════════════════════════════════════════════════════════════╗
║  🔗 [최우선 규칙] 이어쓰기 필수 - ${targetEpisodeNumber - 1}화 직후부터 시작   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
▶ 위에 제공된 【직전 회차 마지막 장면】의 마지막 문장 직후부터 작성하라
▶ 시간 점프 금지, 장소 전환으로 시작 금지, 새 챕터로 시작 금지
▶ 직전 회차의 긴장감/분위기/등장인물을 그대로 유지하며 시작하라
` : '';

  const userPrompt = `${contextPrompt}

═══════════════════════════════════════════════════════════════════════════════
                           【이번 회차 지시사항】
═══════════════════════════════════════════════════════════════════════════════

▶ 작성할 회차: ${targetEpisodeNumber}화
${continuityReminder}
▶ PD님의 요청:
${userInstruction}

═══════════════════════════════════════════════════════════════════════════════
                              【출력 형식】
═══════════════════════════════════════════════════════════════════════════════

- 에피소드 본문만 출력하세요.
- 제목, 회차 번호, 메타 정보, 작가의 말 등은 포함하지 마세요.
- 순수 본문만 작성합니다.

🚨🚨🚨 [분량 필수] 공백 포함 4,000자 ~ 6,000자 🚨🚨🚨
- 2,500자에서 끊으면 실패입니다
- 반드시 4,000자 이상 작성 후 클리프행어로 마무리하세요
- 중간에 멈추지 말고 끝까지 작성하세요

═══════════════════════════════════════════════════════════════════════════════
                         🚨 최종 점검 체크리스트 🚨
═══════════════════════════════════════════════════════════════════════════════

작성 전 다음 사항을 반드시 확인하라:
${targetEpisodeNumber > 1 ? '□ 직전 회차의 마지막 장면에서 바로 이어서 시작하는가? (시간/장소 점프 금지)' : ''}
□ 등장하는 모든 주요 인물이 【등장인물 데이터베이스】에 있는가?
□ 주인공에게 DB에 없는 "사형", "동문"을 창조하지 않았는가?
□ 메인 빌런이 자신의 정체/악행을 직접 실토하지 않았는가?
□ 빌런이 등장할 경우 선량한 인물인 척 연기하고 있는가?
□ 세계관에 없는 문파/조직을 창조하지 않았는가?
□ 4,000자 이상 작성하고 클리프행어로 끝나는가?

이제 ${targetEpisodeNumber}화를 작성해주세요. 반드시 4,000자 이상 작성하세요.`;

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
