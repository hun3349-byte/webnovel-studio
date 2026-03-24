import { NextRequest } from 'next/server';
import {
  generateEpisodeStreaming,
  createSSEStream,
  createHeartbeatMessage,
  createTextChunkMessage,
  createCompleteMessage,
  createErrorMessage,
} from '@/lib/ai/claude-client';
import {
  buildEpisodeGenerationPrompts,
  createTestContext,
} from '@/core/engine/prompt-injector';
import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';

// ============================================================================
// 테스트 에피소드 생성 API (스트리밍)
// - TTFB 방어를 위한 Heartbeat 포함
// - SSE (Server-Sent Events) 방식
// - Mock 모드 지원 (API 없이 테스트)
// - Edge Runtime: Vercel 서버리스 15초 타임아웃 우회
// ============================================================================

// Edge Runtime 강제 설정 (Vercel Serverless 15초 제한 우회)
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 최대 실행 시간 설정 (Edge: 최대 30초, Vercel Pro: 60초)
export const maxDuration = 60;

// Mock 에피소드 텍스트 (무협 세계관) - v2.0 Show Don't Tell 강화
const MOCK_EPISODE_TEXT = `검병을 쥔 손아귀에 핏대가 섰다.

청운은 그 손을 내려다보았다. 불과 반나절 전만 해도 벌레 하나 밟지 못해 사형들에게 놀림받던 손이었다. 지금 그 손가락 마디마디에 핏빛 잔상이 어른거렸다.

스승님의 목이 꺾이던 소리. 사형들의 비명. 연기 냄새.

"으으..."

이를 악물었다. 관자놀이가 지끈거렸다. 하지만 멈출 수 없었다. 발걸음을 옮길 때마다 허리춤의 옥패가 찰랑거리며 차가운 감촉을 전해왔다. 스승님의 유품. 그것만이 지금 청운을 앞으로 밀어내고 있었다.

산길은 가팔랐다. 종아리가 욱신거렸고, 목구멍은 바짝 말라 있었다.

그때, 코끝을 스치는 냄새에 발걸음이 멎었다.

누룩 냄새. 그리고 묵은 땀내.

목덜미의 솜털이 곤두섰다. 청운의 손이 무의식적으로 검자루를 향했다.

스르륵—

앞쪽 수풀이 갈라지며 쇠붙이가 스치는 소리가 났다. 좁은 산길 양옆에서 세 개의 그림자가 천천히 모습을 드러냈다.

한 놈은 대머리에 도끼를 들었고, 나머지 둘은 녹슨 언월도를 어깨에 걸치고 있었다. 입 꼬리에 걸린 음흉한 미소. 눈알이 청운의 허리춤을 훑었다.

'산적.'

심장이 요동쳤다. 손바닥에 땀이 배어났다. 하지만 청운은 검자루에서 손을 떼지 않았다.

"야, 저 새끼 손 좀 봐."

대머리 산적이 킥킥거렸다. 그의 시선이 청운의 손에 머물렀다.

"손가락 마디에 굳은살이 박혔네. 검 좀 만져본 놈인가 보군."

청운은 대답하지 않았다. 대신 세 놈의 위치를 눈으로 훑었다. 대머리가 정면, 나머지 둘이 양옆. 협공 대형이었다.

"뭐야, 왜 말이 없어?"

대머리가 도끼를 어깨에 탁 걸치며 한 발 다가왔다. 그의 입에서 쏟아지는 술 냄새가 여기까지 풍겼다.

"통행세 내면 보내줄게. 그 옥패랑... 그래, 검도 놓고 가."

청운의 눈이 가늘어졌다.

스승님의 검. 차마 눈을 감지 못하신 스승님의 손에서 직접 받아든 검이었다.

"...못 줍니다."

목소리가 낮게 깔렸다. 손가락에 힘이 들어갔다. 검병이 손바닥을 파고들었다.

"뭐?"

대머리의 눈썹이 꿈틀거렸다.

"야, 이 새끼가 지금..."

말이 끝나기 전이었다.

청운의 검이 칼집을 벗어났다. 스승님께 배운 청풍검법 기본초식, 봉황점두(鳳凰點頭). 검끝이 허공에 은빛 궤적을 그리며 대머리의 목을 향해 쇄도했다.

"읏?!"

대머리가 본능적으로 도끼를 들어올렸다.

꽈앙—!

충격이 손목을 타고 어깨까지 찌르르 전해졌다. 청운의 이가 맞부딪쳤다. 도끼의 무게가 상상 이상이었다. 하지만 물러서지 않았다.

'물러서면 죽는다.'

검을 비틀어 힘을 흘렸다. 도끼가 옆으로 밀려났다. 그 틈을 놓치지 않았다. 검을 당겼다가 다시 찔렀다.

청풍검법 삼초식, 추풍낙엽(秋風落葉).

검끝이 대머리의 볼을 스쳤다. 살을 가르는 감촉이 검을 통해 전해졌다. 뜨거운 것이 청운의 뺨에 튀었다.

피.

"꺄아아악!"

대머리가 볼을 움켜쥐며 뒤로 나자빠졌다. 손가락 사이로 핏물이 줄줄 흘러내렸다.

"미, 미친! 저놈 무공을 알아!"

양옆의 산적들이 우왕좌왕했다. 그들의 눈에 공포가 어렸다. 청운은 그 틈을 놓치지 않았다.

검을 크게 원을 그리며 휘둘렀다. 은빛 잔상이 세 개로 갈라지는 것처럼 보였다.

"히이익!"

비명과 함께 산적들이 도망쳤다. 산길을 굴러 내려가다 서로 부딪쳐 넘어지고, 그 와중에도 기어서라도 달아났다.

청운은 쫓지 않았다.

무릎이 꺾였다. 땅에 검을 짚고 겨우 버텼다. 심장이 미친 듯이 뛰었다. 허파가 불덩이처럼 뜨거웠다.

첫 실전이었다.

손을 들어 뺨에 묻은 것을 닦았다. 손등에 선명한 핏자국. 남의 피였다.

구역질이 올라왔다. 하지만 삼켰다.

'이 정도로는... 부족해.'

검을 쥔 손이 아직도 떨리고 있었다. 저 정도 잡것에게 이 꼴이라니. 청풍파를 멸문시킨 자들은 이런 산적 따위와는 차원이 달랐다.

그때.

등골이 서늘해졌다.

호흡을 멈췄다. 땀이 등줄기를 타고 흘러내렸다. 분명 아무것도 없었다. 아까 확인했다. 그런데...

희미한 숨소리.

아니, 숨소리라기보다는 기척에 가까웠다. 그림자 속에 묻혀 있던, 아주 미세한 생명의 파동.

'...처음부터 거기 있었던 건가?'

청운의 고개가 천천히 돌아갔다.

길가의 큰 바위. 그 그늘 속에 누군가 앉아 있었다.

노인이었다. 마른 체구에 흰 수염. 어디서나 볼 수 있는 평범한 노인의 외양이었다.

하지만.

눈이 달랐다.

마치 심연을 들여다보는 듯한 깊이. 청운과 눈이 마주치자 노인의 입 꼬리가 살짝 올라갔다.

"호흡이 흐트러졌구나."

낮고 침착한 목소리였다.

"첫 살수(殺手)치고는 나쁘지 않았다만, 마무리가 엉망이야."

청운의 손이 다시 검으로 향했다. 하지만 검을 쥐기도 전에 깨달았다.

이 노인에게는 의미가 없다.

어떻게 아는지는 모르겠지만, 직감이 그렇게 말하고 있었다. 저 노인이 마음만 먹으면 청운의 목을 베는 것쯤은 숨 쉬듯 쉬울 것이라고.

"...누구십니까?"

목소리가 떨렸다. 그것조차 통제되지 않았다.

노인이 천천히 일어섰다. 먼지를 털며 청운에게 다가왔다.

"청풍검법을 쓰더군. 그 옥패... 청풍진인의 물건이 맞느냐?"

심장이 쿵, 내려앉았다.

"스승님을... 아십니까?"

노인의 눈이 잠시 어두워졌다가 다시 밝아졌다.

"알고말고. 삼십 년 전에 술을 나눠 마신 사이지."

노인이 청운의 앞에 멈춰 섰다. 생각보다 키가 컸다.

"그리고..."

노인이 청운의 눈을 똑바로 들여다보았다.

"누가 청풍파를 멸문시켰는지도 안다."

청운의 숨이 멎었다.

검이 손에서 떨어질 뻔했다. 가까스로 움켜쥐었지만, 손끝이 미세하게 떨리고 있었다.

"...정말입니까?"

목소리가 갈라졌다.

노인은 대답하지 않았다. 대신 천천히 몸을 돌려 산길 아래를 바라보았다.

"따라오너라. 길고 긴 이야기가 될 테니까."

청운의 발이 땅에 붙은 듯 움직이지 않았다.

모르는 노인이었다. 따라가면 무슨 일이 생길지 알 수 없었다. 하지만—

'원수를 알 수 있다면.'

주먹을 쥐었다.

첫 발을 내디뎠다.

노인의 등 뒤를 따라 산길을 내려가는 청운의 어깨가 미세하게 떨리고 있었다. 두려움인지, 기대인지, 본인도 알 수 없었다.

노인이 걸음을 멈추지 않고 물었다.

"이름이 뭐냐?"

"...이청운입니다."

"청운. 푸른 구름이라. 청풍진인이 지어줬겠구나."

청운은 대답하지 못했다. 목이 메어왔다.

노인이 발걸음을 늦추지 않고 말을 이었다.

"나는... 사람들이 '검마(劍魔)'라고 부르더라."

청운의 발걸음이 우뚝 멈췄다.

검마.

강호십대고수. 이십 년 전 천하제일검을 다투다 홀연히 종적을 감춘 전설의 검객. 죽었다는 설, 폐인이 되었다는 설, 은거에 들어갔다는 설이 분분한 인물.

그 검마가...

"걸어."

노인의 목소리가 조용히 울렸다.

"멈추면 앞으로 나아갈 수 없다."

청운의 다리가 다시 움직였다.

그리고 노인이 마지막으로 던진 말에, 청운의 심장이 얼어붙었다.

"네 복수를 도와주마. 대신..."

노인의 눈이 뒤를 돌아보았다. 그 눈빛 속에 무엇인가 위험한 것이 스쳐 지나갔다.

"내 마지막 제자가 될 각오는 되어 있느냐?"`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userInstruction = '주인공이 강호에 첫발을 내딛는 장면을 작성해주세요. 첫 번째 적과 조우하는 긴장감 있는 전개로 부탁합니다.',
      targetEpisodeNumber = 2,
      useTestContext = false, // ★ 기본값을 false로 변경 (실제 DB 우선)
      useMock = false, // ★ Mock 모드 플래그
      projectId, // ★ 프로젝트 ID (실제 DB 사용 시 필수)
    } = body;

    // ★ Mock 모드: API 없이 더미 데이터로 스트리밍 테스트
    if (useMock) {
      return createMockStreamResponse();
    }

    // ★ 컨텍스트 결정 로직 개선
    let context;

    if (projectId) {
      // projectId가 있으면 실제 DB에서 컨텍스트 빌드 (시놉시스 포함)
      console.log('[TEST-GENERATE] projectId로 컨텍스트 빌드 시작:', { projectId, targetEpisodeNumber });
      try {
        context = await buildSlidingWindowContext(projectId, targetEpisodeNumber, {
          windowSize: 3,
          includeWritingPreferences: true,
          includeSynopses: true, // ★★★ 시놉시스 필수 로드 ★★★
          includeTimelineEvents: true,
        });
        // ★★★ 시놉시스 로드 확인 ★★★
        console.log('[TEST-GENERATE] 컨텍스트 빌드 완료:', {
          hasEpisodeSynopses: !!context.episodeSynopses,
          synopsesCount: context.episodeSynopses?.length || 0,
          currentSynopsis: context.episodeSynopses?.find((s: { isCurrent?: boolean }) => s.isCurrent)?.synopsis?.substring(0, 100) || 'NONE',
        });
      } catch (dbError) {
        console.error('DB 컨텍스트 빌드 실패:', dbError);
        // DB 실패 시 에러 반환 (테스트 컨텍스트로 폴백하지 않음)
        return new Response(
          JSON.stringify({
            error: `DB 컨텍스트 빌드 실패: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
            hint: 'projectId가 올바른지, Supabase 연결이 정상인지 확인하세요.'
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } else if (useTestContext) {
      // projectId 없고 useTestContext=true일 때만 테스트 컨텍스트 사용
      context = createTestContext();
    } else if (body.context) {
      // 직접 컨텍스트 전달
      context = body.context;
    } else {
      return new Response(
        JSON.stringify({
          error: 'projectId 또는 context가 필요합니다.',
          hint: 'projectId를 전달하면 실제 DB 데이터를 사용합니다. useTestContext=true를 전달하면 테스트 데이터를 사용합니다.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 프롬프트 조립 (V10.0: 동적 StyleDNA 로드)
    const { systemPrompt, userPrompt } = await buildEpisodeGenerationPrompts(
      context,
      userInstruction,
      targetEpisodeNumber,
      projectId  // V10.0: 동적 StyleDNA 로드용
    );

    // SSE 스트림 생성
    const stream = createSSEStream(async ({ enqueue, close }) => {
      let fullText = '';

      try {
        // ★★★ maxTokens: 8192 명시적 설정 (2,500자 잘림 방지) ★★★
        await generateEpisodeStreaming({
          systemPrompt,
          userPrompt,
          maxTokens: 8192, // 절대 변경 금지 - 6,000자 분량 보장
          temperature: 0.8,

          // ★ TTFB 방어: 스트림 시작 전 즉시 Heartbeat 전송
          onHeartbeat: () => {
            enqueue(createHeartbeatMessage('작가 AI가 이전 회차를 읽고 있습니다...'));
          },

          // 텍스트 청크 수신
          onTextChunk: (chunk) => {
            fullText += chunk;
            enqueue(createTextChunkMessage(chunk));
          },

          // 완료
          onComplete: (text) => {
            const charCount = text.length;
            enqueue(
              createCompleteMessage({
                fullText: text,
                charCount,
                inputTokens: 0,
                outputTokens: 0,
              })
            );
          },

          // 에러
          onError: (error) => {
            enqueue(createErrorMessage(error.message));
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        enqueue(createErrorMessage(errorMessage));
      }

      close();
    });

    // SSE 응답 헤더
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('Test generate error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Mock 스트리밍 응답 생성
 */
function createMockStreamResponse(): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 1. Heartbeat 전송
      controller.enqueue(
        encoder.encode(`data: ${createHeartbeatMessage('[Mock] 작가 AI가 이전 회차를 읽고 있습니다...')}\n\n`)
      );

      await sleep(500);

      // 2. Heartbeat 2
      controller.enqueue(
        encoder.encode(`data: ${createHeartbeatMessage('[Mock] 세계관과 캐릭터 정보를 분석 중...')}\n\n`)
      );

      await sleep(500);

      // 3. 텍스트 청크 전송 (한 글자씩이 아닌, 적절한 청크 단위로)
      const chunks = MOCK_EPISODE_TEXT.split('\n\n');
      let fullText = '';

      for (const chunk of chunks) {
        const textWithBreak = chunk + '\n\n';
        fullText += textWithBreak;

        controller.enqueue(
          encoder.encode(`data: ${createTextChunkMessage(textWithBreak)}\n\n`)
        );

        // 실제 타이핑 효과를 위한 딜레이
        await sleep(50 + Math.random() * 100);
      }

      // 4. 완료 메시지
      controller.enqueue(
        encoder.encode(`data: ${createCompleteMessage({
          fullText: fullText.trim(),
          charCount: fullText.trim().length,
          inputTokens: 1234,
          outputTokens: 2345,
        })}\n\n`)
      );

      // 5. 종료
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * GET: 테스트 엔드포인트 상태 확인
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/ai/test-generate',
      method: 'POST',
      description: '스트리밍 에피소드 생성 테스트 API',
      requiredEnv: ['ANTHROPIC_API_KEY'],
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      mockMode: 'useMock=true로 API 없이 테스트 가능',
      body: {
        projectId: 'string (권장) - 프로젝트 ID. 지정 시 실제 DB의 World Bible/Character 사용',
        userInstruction: 'string (optional) - PD 지시사항',
        targetEpisodeNumber: 'number (optional, default: 2) - 작성할 회차',
        useTestContext: 'boolean (optional, default: false) - true면 하드코딩된 테스트 컨텍스트 사용',
        useMock: 'boolean (optional, default: false) - Mock 모드 사용 여부',
      },
      usage: {
        recommended: 'projectId를 전달하여 실제 DB 데이터 사용',
        fallback: 'useTestContext=true로 테스트 데이터 사용 (DB 없이 테스트)',
      },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
