import Anthropic from '@anthropic-ai/sdk';

// ============================================================================
// Claude API 클라이언트
// - 스트리밍 (SSE) 기반
// - TTFB 방어를 위한 Heartbeat 지원
// ============================================================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Claude API 클라이언트 생성
 * 비스트리밍 용도로 사용
 */
export function createClaudeClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

// 기본 모델 설정
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
// ★★★ 에피소드 생성용 최대 토큰 (절대 변경 금지) ★★★
// 한글 6,000자 ≈ 약 4,000~5,000 토큰 + 여유분 = 8192
const MAX_TOKENS = 8192;

/**
 * 스트리밍 옵션
 */
export interface StreamingOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt: string;
  userPrompt: string;
  // TTFB 방어용 콜백
  onHeartbeat?: () => void;
  onTextChunk?: (chunk: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/**
 * 스트리밍 생성 결과
 */
export interface StreamingResult {
  fullText: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Claude 스트리밍 에피소드 생성
 *
 * @description
 * - Server-Sent Events (SSE) 방식으로 응답
 * - TTFB 방어: 스트림 시작 전 heartbeat 콜백 호출
 */
export async function generateEpisodeStreaming(
  options: StreamingOptions
): Promise<StreamingResult> {
  const {
    model = DEFAULT_MODEL,
    maxTokens = MAX_TOKENS,
    // ★★★ v8.6: 창의성 및 자연스러움 향상을 위해 temperature 0.82로 상향 ★★★
    // 범위 0.75~0.85 권장 (문장의 다양성과 자연스러운 흐름)
    temperature = 0.82,
    systemPrompt,
    userPrompt,
    onHeartbeat,
    onTextChunk,
    onComplete,
    onError,
  } = options;

  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    // TTFB 방어: 스트림 시작 전 heartbeat 전송
    onHeartbeat?.();

    const stream = await anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    // 스트림 이벤트 처리
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if ('text' in delta) {
          const chunk = delta.text;
          fullText += chunk;
          onTextChunk?.(chunk);
        }
      } else if (event.type === 'message_start') {
        inputTokens = event.message.usage?.input_tokens || 0;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens || 0;
      }
    }

    onComplete?.(fullText);

    return {
      fullText,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    onError?.(err);
    throw err;
  }
}

/**
 * Claude 비스트리밍 호출 (로그 압축용)
 *
 * @description
 * 짧은 응답이 예상되는 작업(로그 압축, 피드백 분석)에 사용
 */
export async function generateCompletion(options: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const {
    systemPrompt,
    userPrompt,
    maxTokens = 2048,
    temperature = 0.3,
  } = options;

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * SSE 스트림 인코더
 *
 * @description
 * API Route에서 ReadableStream을 생성할 때 사용
 */
export function createSSEStream(
  generator: (controller: {
    enqueue: (data: string) => void;
    close: () => void;
  }) => Promise<void>
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => {
        // SSE 포맷: data: {...}\n\n
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      };

      const close = () => {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      };

      try {
        await generator({ enqueue, close });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        enqueue(JSON.stringify({ type: 'error', message: errorMessage }));
        close();
      }
    },
  });
}

/**
 * Heartbeat 메시지 생성
 */
export function createHeartbeatMessage(message: string): string {
  return JSON.stringify({
    type: 'heartbeat',
    message,
    timestamp: Date.now(),
  });
}

/**
 * 텍스트 청크 메시지 생성
 */
export function createTextChunkMessage(text: string): string {
  return JSON.stringify({
    type: 'text',
    content: text,
  });
}

/**
 * 완료 메시지 생성
 */
export function createCompleteMessage(data: {
  fullText: string;
  charCount: number;
  inputTokens: number;
  outputTokens: number;
}): string {
  return JSON.stringify({
    type: 'complete',
    ...data,
  });
}

/**
 * 에러 메시지 생성
 */
export function createErrorMessage(error: string): string {
  return JSON.stringify({
    type: 'error',
    message: error,
  });
}
