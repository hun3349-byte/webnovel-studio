import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClaudeClient } from '@/lib/ai/claude-client';

const FEEDBACK_ANALYSIS_PROMPT = `당신은 웹소설 문체 분석 전문가입니다.
사용자(PD)가 AI가 생성한 텍스트를 어떻게 수정했는지 분석하여,
향후 AI가 학습해야 할 문체 패턴을 추출합니다.

## 분석 규칙
1. 원본과 수정본을 비교하여 PD의 선호 패턴을 파악합니다.
2. "피해야 할 패턴"과 "선호하는 패턴"을 명확히 구분합니다.
3. 구체적인 예시와 함께 패턴을 설명합니다.
4. 신뢰도(0.0~1.0)를 평가합니다. (변경이 일관적일수록 높은 신뢰도)

## 분석 카테고리
- style: 문체, 어투, 톤
- vocabulary: 어휘 선택, 단어 사용
- pacing: 문장 호흡, 리듬
- dialogue: 대사 스타일
- description: 묘사 방식
- structure: 문단 구조, 전개 방식

## 출력 형식 (JSON)
{
  "feedback_type": "카테고리명",
  "preference_summary": "간단한 요약 (1-2문장)",
  "avoid_patterns": ["피해야 할 패턴1", "피해야 할 패턴2"],
  "favor_patterns": ["선호하는 패턴1", "선호하는 패턴2"],
  "confidence": 0.7,
  "examples": [
    {
      "original": "원본 문장",
      "edited": "수정된 문장",
      "explanation": "변경 이유"
    }
  ]
}`;

export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { originalText, editedText, useMock } = body;

    if (!originalText || !editedText) {
      return NextResponse.json(
        { error: 'originalText and editedText are required' },
        { status: 400 }
      );
    }

    // Mock 모드
    if (useMock) {
      const mockAnalysis = {
        feedback_type: 'style',
        preference_summary: '짧고 간결한 문장을 선호하며, 감정 직접 서술보다 행동 묘사를 통한 표현을 선호합니다.',
        avoid_patterns: [
          '감정을 직접 서술하는 표현 (예: "그는 슬펐다")',
          '지나치게 긴 문장 (30자 이상)',
          '부사의 과다 사용',
        ],
        favor_patterns: [
          '신체 반응으로 감정 표현 (예: "주먹이 떨렸다")',
          '짧은 문장 위주의 긴장감 있는 전개',
          '대화 후 동작 묘사 삽입',
        ],
        confidence: 0.75,
        examples: [
          {
            original: '그는 매우 화가 났다.',
            edited: '그의 턱이 딱딱하게 굳었다.',
            explanation: 'Show, Don\'t Tell 원칙 적용',
          },
        ],
      };

      return NextResponse.json({ analysis: mockAnalysis });
    }

    // 실제 Claude API 호출
    const client = createClaudeClient();
    const userPrompt = `## 원본 텍스트
${originalText}

## 수정된 텍스트
${editedText}

위 두 텍스트를 비교 분석하여 PD의 문체 선호도를 JSON 형식으로 출력해주세요.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: FEEDBACK_ANALYSIS_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // 응답 파싱
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // JSON 추출
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse JSON from response');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Feedback analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
    const errorDetails = error instanceof Error ? { name: error.name, stack: error.stack } : {};

    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  }
}
