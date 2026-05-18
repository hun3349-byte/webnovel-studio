/**
 * AI-based Diff Analyzer (Phase 4)
 *
 * AI를 사용하여 원본과 수정본의 차이에서 스타일 패턴을 추출
 * GPT-4o-mini 사용 (비용 효율)
 */

import { generateOpenAIText } from './openai-client';
import type { StyleAnalysisResult } from '@/types/style-dna';

interface DiffInput {
  removed: string[];
  added: string[];
}

const SYSTEM_PROMPT = `당신은 웹소설 문체 분석 전문가입니다.
PD가 AI 생성 본문을 수정한 내용을 분석하여 스타일 패턴을 추출합니다.

삭제된 문장(removed)과 추가된 문장(added)을 비교하여:
1. PD가 피하고 싶어하는 패턴 (avoidPatterns)
2. PD가 선호하는 패턴 (favorPatterns)
3. 전반적인 문체 규칙 (proseStyle, rhythmPattern, dialogueStyle 등)

을 JSON 형식으로 추출하세요.

응답 형식:
{
  "proseStyle": "전반적인 문체 규칙 (1-2문장)",
  "rhythmPattern": "문장 호흡/리듬 규칙 (없으면 null)",
  "dialogueStyle": "대사 스타일 규칙 (없으면 null)",
  "emotionExpression": "감정 표현 규칙 (없으면 null)",
  "sceneTransition": "장면 전환 규칙 (없으면 null)",
  "actionDescription": "액션 묘사 규칙 (없으면 null)",
  "avoidPatterns": ["피해야 할 패턴 1", "피해야 할 패턴 2"],
  "favorPatterns": ["선호 패턴 1", "선호 패턴 2"]
}

규칙:
- 구체적이고 적용 가능한 패턴만 추출
- 추상적이거나 모호한 규칙은 제외
- 반복되는 패턴에 높은 가중치
- JSON만 출력, 다른 설명 없이`;

/**
 * AI를 사용하여 diff에서 스타일 패턴 추출
 */
export async function extractPatternsFromDiff(
  diffs: DiffInput
): Promise<StyleAnalysisResult | null> {
  // diff가 너무 적으면 분석 불필요
  if (diffs.removed.length === 0 && diffs.added.length === 0) {
    return null;
  }

  // 최대 5개씩만 분석 (비용 절약)
  const removedSample = diffs.removed.slice(0, 5);
  const addedSample = diffs.added.slice(0, 5);

  const userPrompt = `다음 수정 내용을 분석하세요:

[삭제된 문장 (AI 원본)]
${removedSample.map((r, i) => `${i + 1}. ${r.slice(0, 300)}${r.length > 300 ? '...' : ''}`).join('\n')}

[추가된 문장 (PD 수정)]
${addedSample.map((a, i) => `${i + 1}. ${a.slice(0, 300)}${a.length > 300 ? '...' : ''}`).join('\n')}

위 수정에서 PD의 스타일 선호도를 JSON으로 추출하세요.`;

  try {
    const result = await generateOpenAIText({
      model: 'gpt-4.1-mini',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxOutputTokens: 1024,
    });

    // JSON 파싱
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[DiffAnalyzer] No JSON found in response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<StyleAnalysisResult>;

    // 유효성 검증
    return {
      proseStyle: typeof parsed.proseStyle === 'string' ? parsed.proseStyle : null,
      rhythmPattern: typeof parsed.rhythmPattern === 'string' ? parsed.rhythmPattern : null,
      dialogueStyle: typeof parsed.dialogueStyle === 'string' ? parsed.dialogueStyle : null,
      emotionExpression:
        typeof parsed.emotionExpression === 'string' ? parsed.emotionExpression : null,
      sceneTransition:
        typeof parsed.sceneTransition === 'string' ? parsed.sceneTransition : null,
      actionDescription:
        typeof parsed.actionDescription === 'string' ? parsed.actionDescription : null,
      avoidPatterns: Array.isArray(parsed.avoidPatterns)
        ? parsed.avoidPatterns.filter((p): p is string => typeof p === 'string')
        : [],
      favorPatterns: Array.isArray(parsed.favorPatterns)
        ? parsed.favorPatterns.filter((p): p is string => typeof p === 'string')
        : [],
      bestSamples: [],
      confidence: 0.7,
    };
  } catch (error) {
    console.error('[DiffAnalyzer] Error:', error);
    return null;
  }
}
