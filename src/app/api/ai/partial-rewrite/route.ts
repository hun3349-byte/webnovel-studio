import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

/**
 * AI 부분 수정 API
 * 선택된 텍스트 구간만 AI로 재생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { originalText, instruction, context } = body;

    if (!originalText?.trim()) {
      return NextResponse.json(
        { error: '수정할 텍스트가 없습니다.' },
        { status: 400 }
      );
    }

    if (!instruction?.trim()) {
      return NextResponse.json(
        { error: '수정 지시사항을 입력해주세요.' },
        { status: 400 }
      );
    }

    const systemPrompt = `당신은 한국 상업 웹소설의 부분 수정 전문가입니다.
사용자가 선택한 텍스트를 지시사항에 맞게 수정하되, 다음 규칙을 반드시 준수하세요:

【절대 규칙】
1. 앞뒤 문맥과 자연스럽게 연결되어야 합니다.
2. 원본 텍스트의 의미와 사건 전개는 유지하세요.
3. 스타카토 문체(짧은 단문 나열) 금지 - 호흡이 길고 밀도 높은 문장으로 작성하세요.
4. 감정 직접 서술 금지 (Show, Don't Tell) - 신체 반응과 행동으로 표현하세요.
5. 판타지적 무공 묘사(검기, 단전의 불꽃 등) 금지 - 현실적/해부학적 전투 묘사로 작성하세요.
6. 하드보일드한 건조함을 유지하되 문장 연결은 유려하게 하세요.

【출력 형식】
- 수정된 텍스트만 출력하세요.
- 설명, 인사말, 마크다운 등 부가 요소 없이 순수 본문만 출력하세요.
- 원본 글자 수와 비슷하거나 더 길게 작성하세요 (절대 짧게 줄이지 마세요).`;

    const userPrompt = `【앞 문맥 (참고용)】
${context?.beforeSelection || '(없음)'}

【수정할 텍스트】
${originalText}

【뒷 문맥 (참고용)】
${context?.afterSelection || '(없음)'}

【수정 지시사항】
${instruction}

위 텍스트를 지시사항에 맞게 수정해주세요. 수정된 텍스트만 출력하세요.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    // 응답에서 텍스트 추출
    const rewrittenText = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    if (!rewrittenText.trim()) {
      return NextResponse.json(
        { error: 'AI 응답이 비어있습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rewrittenText: rewrittenText.trim(),
      originalLength: originalText.length,
      newLength: rewrittenText.trim().length,
    });
  } catch (error) {
    console.error('[PartialRewrite] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '부분 수정 실패' },
      { status: 500 }
    );
  }
}
