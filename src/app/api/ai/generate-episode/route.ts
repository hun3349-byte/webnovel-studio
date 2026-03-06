import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';
import { buildEpisodeGenerationPrompts } from '@/core/engine/prompt-injector';
import {
  generateEpisodeStreaming,
  createSSEStream,
  createHeartbeatMessage,
  createTextChunkMessage,
  createCompleteMessage,
  createErrorMessage,
} from '@/lib/ai/claude-client';
import type { EpisodeGenerationRequest } from '@/types/memory';

// ============================================================================
// 에피소드 생성 API (SSE 스트리밍)
// - 슬라이딩 윈도우 컨텍스트 기반
// - Claude API 실시간 스트리밍
// - TTFB 방어를 위한 Heartbeat 포함
// - Edge Runtime: Vercel 서버리스 15초 타임아웃 우회
// ============================================================================

// Edge Runtime 강제 설정 (Vercel Serverless 15초 제한 우회)
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// 최대 실행 시간 설정 (Edge: 최대 30초, Vercel Pro: 60초)
export const maxDuration = 60;

// 상수
const MIN_CHAR_COUNT = 4000;
const MAX_CHAR_COUNT = 6000;

export async function POST(request: NextRequest) {
  try {
    // 인증 확인 (SSE 스트림 전에 수행)
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body: EpisodeGenerationRequest = await request.json();
    const {
      projectId,
      targetEpisodeNumber,
      userInstruction,
      windowSize = 3,
      longTermSearchQueries = [],
      saveToDb = true, // 생성 후 DB 저장 여부
    } = body;

    // SSE 스트림 생성
    const stream = createSSEStream(async ({ enqueue, close }) => {
      let fullText = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        // 1. Heartbeat: 컨텍스트 빌드 시작 알림
        enqueue(createHeartbeatMessage('작가 AI가 이전 회차를 읽고 있습니다...'));

        // 2. 슬라이딩 윈도우 컨텍스트 빌드
        const context = await buildSlidingWindowContext(projectId, targetEpisodeNumber, {
          windowSize,
          longTermSearchQueries,
          includeWritingPreferences: true,
        });

        // 3. Heartbeat: 프롬프트 조립 알림
        enqueue(createHeartbeatMessage('세계관과 캐릭터 정보를 분석 중...'));

        // 4. 프롬프트 조립
        const { systemPrompt, userPrompt } = buildEpisodeGenerationPrompts(
          context,
          userInstruction,
          targetEpisodeNumber
        );

        // 5. Claude API 스트리밍 호출
        // ★★★ maxTokens: 8192 명시적 설정 (2,500자 잘림 방지) ★★★
        const result = await generateEpisodeStreaming({
          systemPrompt,
          userPrompt,
          maxTokens: 8192, // 절대 변경 금지 - 6,000자 분량 보장
          temperature: 0.8,

          // TTFB 방어: 스트림 시작 전 즉시 Heartbeat 전송
          onHeartbeat: () => {
            enqueue(createHeartbeatMessage('에피소드 작성을 시작합니다...'));
          },

          // 텍스트 청크 수신
          onTextChunk: (chunk) => {
            fullText += chunk;
            enqueue(createTextChunkMessage(chunk));
          },

          // 에러
          onError: (error) => {
            enqueue(createErrorMessage(error.message));
          },
        });

        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;
        fullText = result.fullText;

        const charCount = fullText.length;

        // 6. 상업성 검증
        const validation = validateCommercialStandards(fullText, charCount);

        // 7. DB 저장 (옵션)
        let episodeId: string | null = null;

        if (saveToDb) {
          const supabase = await createServerSupabaseClient();

          const { data: episode, error } = await supabase
            .from('episodes')
            .insert({
              project_id: projectId,
              episode_number: targetEpisodeNumber,
              content: fullText,
              char_count: charCount,
              status: 'draft',
            })
            .select()
            .single();

          if (error) {
            enqueue(createErrorMessage(`에피소드 저장 실패: ${error.message}`));
          } else {
            episodeId = episode.id;
          }
        }

        // 8. 완료 메시지 전송
        enqueue(
          createCompleteMessage({
            fullText,
            charCount,
            inputTokens,
            outputTokens,
          })
        );

        // 추가 메타 정보 전송
        enqueue(
          JSON.stringify({
            type: 'metadata',
            episodeId,
            validation,
            targetEpisodeNumber,
          })
        );

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('에피소드 생성 오류:', error);
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
    console.error('에피소드 생성 오류:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * 상업성 기준 검증
 */
function validateCommercialStandards(
  content: string,
  charCount: number
): { passed: boolean; issues: string[] } {
  const issues: string[] = [];

  // 분량 검증
  if (charCount < MIN_CHAR_COUNT) {
    issues.push(`분량 부족: ${charCount}자 (최소 ${MIN_CHAR_COUNT}자 필요)`);
  }
  if (charCount > MAX_CHAR_COUNT) {
    issues.push(`분량 초과: ${charCount}자 (최대 ${MAX_CHAR_COUNT}자)`);
  }

  // 절단신공 검증 (마지막 문단 분석)
  const lastParagraph = content.split('\n\n').pop() || '';
  const cliffhangerKeywords = ['하지만', '그때', '순간', '갑자기', '...', '?', '!'];
  const hasCliffhanger = cliffhangerKeywords.some(kw => lastParagraph.includes(kw));
  if (!hasCliffhanger) {
    issues.push('절단신공 부족: 마지막 문단에 긴장감/반전 요소 필요');
  }

  // Show Don't Tell 검증 (금지 패턴 체크)
  const tellPatterns = [
    /그는 화가 났다/,
    /그녀는 슬펐다/,
    /긴장했다/,
    /상황이 긴박했다/,
    /위험했다/,
  ];
  const tellViolations = tellPatterns.filter(pattern => pattern.test(content));
  if (tellViolations.length > 0) {
    issues.push(`Show Don't Tell 위반: 직접적인 감정/상황 서술 ${tellViolations.length}건 발견`);
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/**
 * GET: 엔드포인트 상태 확인
 */
export async function GET() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      endpoint: '/api/ai/generate-episode',
      method: 'POST',
      description: '에피소드 생성 API (SSE 스트리밍)',
      requiredEnv: ['ANTHROPIC_API_KEY'],
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      body: {
        projectId: 'string (required) - 프로젝트 ID',
        targetEpisodeNumber: 'number (required) - 작성할 회차',
        userInstruction: 'string (required) - PD 지시사항',
        windowSize: 'number (optional, default: 3) - 슬라이딩 윈도우 크기',
        longTermSearchQueries: 'string[] (optional) - 장기 기억 검색 쿼리',
        saveToDb: 'boolean (optional, default: true) - DB 저장 여부',
      },
      responseFormat: 'SSE (Server-Sent Events)',
      messageTypes: {
        heartbeat: '진행 상황 알림',
        text: '생성된 텍스트 청크',
        complete: '생성 완료 (글자 수, 토큰 사용량)',
        metadata: '추가 정보 (episodeId, validation)',
        error: '에러 발생',
      },
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
