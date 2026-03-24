// ============================================================================
// Style Analyzer - 레퍼런스 소설 및 PD 피드백 분석
// ============================================================================

import { generateCompletion } from '@/lib/ai/claude-client';
import type { StyleAnalysisResult, BestSample } from '@/types/style-dna';

// ============================================================================
// 프롬프트 템플릿
// ============================================================================

const STYLE_ANALYSIS_SYSTEM_PROMPT = `당신은 상업 웹소설 문체 분석 전문가입니다.
주어진 텍스트에서 작가의 고유한 문체 DNA를 추출합니다.

분석 항목:
1. prose_style: 문체 특성 (문장 길이, 호흡, 어미 패턴, 밀도)
2. rhythm_pattern: 리듬 패턴 (단짠단짠, 긴장-이완 교차)
3. dialogue_style: 대화체 스타일 (말투, 비중, 전후 묘사)
4. emotion_expression: 감정 표현 방식 (Show Don't Tell 정도)
5. scene_transition: 장면 전환 기법 (오버랩, 컷, 시간 점프)
6. action_description: 액션/전투 묘사 방식 (현실적/판타지적)

각 항목은 100자 이내로 핵심만 요약합니다.
반드시 JSON 형식으로만 응답하세요.`;

const buildStyleAnalysisPrompt = (text: string): string => `
다음 웹소설 샘플 텍스트를 분석하여 문체 DNA를 추출해주세요.

【분석 대상 텍스트】
"""
${text.substring(0, 8000)}
"""

【출력 형식 - JSON만 출력하세요】
\`\`\`json
{
  "proseStyle": "문체 특성 요약 (100자 이내)",
  "rhythmPattern": "리듬 패턴 설명 (100자 이내)",
  "dialogueStyle": "대화체 스타일 (100자 이내)",
  "emotionExpression": "감정 표현 방식 (100자 이내)",
  "sceneTransition": "장면 전환 기법 (100자 이내)",
  "actionDescription": "액션 묘사 방식 (100자 이내)",
  "bestSamples": [
    {
      "category": "prose|dialogue|action|emotion|transition|rhythm",
      "badExample": "피해야 할 예시 (선택, 50자 이내)",
      "goodExample": "모범 예시 - 텍스트에서 발췌 (100자 이내)",
      "explanation": "이 문장이 좋은 이유 (50자 이내)"
    }
  ],
  "avoidPatterns": ["피해야 할 패턴1", "피해야 할 패턴2"],
  "favorPatterns": ["권장 패턴1", "권장 패턴2"],
  "confidence": 0.75
}
\`\`\`

bestSamples는 최대 3개까지, 가장 특징적인 문장을 선별하세요.
avoidPatterns, favorPatterns는 각각 최대 5개까지.`;

const FEEDBACK_ANALYSIS_SYSTEM_PROMPT = `당신은 웹소설 문체 분석 전문가입니다.
원본과 수정본을 비교하여 PD(편집자)의 문체 선호도를 DNA 형태로 추출합니다.

PD가 수정한 부분에서 패턴을 찾아:
1. 어떤 표현을 피하는지 (avoidPatterns)
2. 어떤 표현을 선호하는지 (favorPatterns)
3. 각 DNA 요소별 특성

반드시 JSON 형식으로만 응답하세요.`;

const buildFeedbackAnalysisPrompt = (originalText: string, editedText: string): string => `
PD가 AI 작가의 원고를 수정했습니다.
원본과 수정본을 비교하여 PD의 문체 선호도를 분석하세요.

【원본 텍스트 (AI 작성)】
"""
${originalText.substring(0, 4000)}
"""

【수정본 텍스트 (PD 편집)】
"""
${editedText.substring(0, 4000)}
"""

【분석 요청】
1. 수정된 부분에서 패턴을 찾으세요.
2. PD가 피하는 표현과 선호하는 표현을 구분하세요.
3. 수정본에서 가장 잘 된 문장을 bestSamples로 선별하세요.

【출력 형식 - JSON만 출력하세요】
\`\`\`json
{
  "proseStyle": "PD가 선호하는 문체 특성 (100자 이내)",
  "rhythmPattern": "PD가 선호하는 리듬 (100자 이내)",
  "dialogueStyle": "PD가 선호하는 대화체 (100자 이내)",
  "emotionExpression": "PD가 선호하는 감정 표현 (100자 이내)",
  "sceneTransition": "PD가 선호하는 장면 전환 (100자 이내)",
  "actionDescription": "PD가 선호하는 액션 묘사 (100자 이내)",
  "bestSamples": [
    {
      "category": "prose|dialogue|action|emotion|transition|rhythm",
      "badExample": "원본에서 수정된 부분",
      "goodExample": "수정본에서 개선된 부분",
      "explanation": "왜 이렇게 수정했는지"
    }
  ],
  "avoidPatterns": ["PD가 피하는 패턴1", "패턴2"],
  "favorPatterns": ["PD가 선호하는 패턴1", "패턴2"],
  "confidence": 0.8
}
\`\`\``;

// ============================================================================
// 분석 함수
// ============================================================================

/**
 * 레퍼런스 소설 텍스트에서 StyleDNA 추출
 */
export async function analyzeStyle(text: string): Promise<StyleAnalysisResult> {
  if (!text || text.length < 500) {
    throw new Error('분석할 텍스트가 너무 짧습니다. 최소 500자 이상 필요합니다.');
  }

  const response = await generateCompletion({
    systemPrompt: STYLE_ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildStyleAnalysisPrompt(text),
    maxTokens: 2048,
    temperature: 0.3,
  });

  return parseAnalysisResponse(response.text);
}

/**
 * PD 피드백(원본/수정본 비교)에서 StyleDNA 추출
 */
export async function analyzeStyleFromFeedback(
  originalText: string,
  editedText: string
): Promise<StyleAnalysisResult> {
  if (!originalText || !editedText) {
    throw new Error('원본과 수정본 텍스트가 모두 필요합니다.');
  }

  // 변경 비율 체크
  const changeRatio = Math.abs(originalText.length - editedText.length) / originalText.length;
  if (changeRatio < 0.05 && originalText === editedText) {
    throw new Error('원본과 수정본 사이에 유의미한 차이가 없습니다.');
  }

  const response = await generateCompletion({
    systemPrompt: FEEDBACK_ANALYSIS_SYSTEM_PROMPT,
    userPrompt: buildFeedbackAnalysisPrompt(originalText, editedText),
    maxTokens: 2048,
    temperature: 0.3,
  });

  const result = parseAnalysisResponse(response.text);

  // PD 피드백은 confidence를 0.85 이상으로 설정 (직접적인 피드백이므로)
  result.confidence = Math.max(result.confidence, 0.85);

  return result;
}

/**
 * 대용량 소설 분석 (3구간 샘플링)
 */
export async function analyzeFullNovel(
  fullText: string,
  sourceName: string
): Promise<StyleAnalysisResult> {
  const samples = extractSamples(fullText);

  // 3개 구간을 각각 분석
  const analyses = await Promise.all(
    samples.map((sample, i) => {
      const section = ['초반', '중반', '엔딩'][i];
      console.log(`[StyleAnalyzer] ${sourceName} ${section} 분석 중...`);
      return analyzeStyle(sample);
    })
  );

  // 3개 분석 결과 합성
  return mergeAnalysisResults(analyses);
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * 대용량 텍스트에서 3개 구간 샘플 추출
 */
function extractSamples(fullText: string, sampleSize: number = 3000): string[] {
  const total = fullText.length;

  if (total <= sampleSize * 3) {
    // 전체 텍스트가 충분히 짧으면 전체 반환
    return [fullText];
  }

  return [
    fullText.substring(0, sampleSize),                                    // 초반
    fullText.substring(total / 2 - sampleSize / 2, total / 2 + sampleSize / 2), // 중반
    fullText.substring(total - sampleSize),                               // 엔딩
  ];
}

/**
 * AI 응답에서 JSON 파싱
 */
function parseAnalysisResponse(responseText: string): StyleAnalysisResult {
  // ```json ... ``` 블록 찾기
  const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);

  let jsonStr: string;
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  } else {
    // JSON 블록이 없으면 { } 찾기
    const braceMatch = responseText.match(/\{[\s\S]*\}/);
    if (!braceMatch) {
      console.error('[StyleAnalyzer] JSON 파싱 실패:', responseText.substring(0, 200));
      throw new Error('AI 응답에서 JSON을 찾을 수 없습니다.');
    }
    jsonStr = braceMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    // 필수 필드 검증 및 기본값 설정
    return {
      proseStyle: parsed.proseStyle || null,
      rhythmPattern: parsed.rhythmPattern || null,
      dialogueStyle: parsed.dialogueStyle || null,
      emotionExpression: parsed.emotionExpression || null,
      sceneTransition: parsed.sceneTransition || null,
      actionDescription: parsed.actionDescription || null,
      bestSamples: Array.isArray(parsed.bestSamples) ? parsed.bestSamples.slice(0, 5) : [],
      avoidPatterns: Array.isArray(parsed.avoidPatterns) ? parsed.avoidPatterns.slice(0, 10) : [],
      favorPatterns: Array.isArray(parsed.favorPatterns) ? parsed.favorPatterns.slice(0, 10) : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7,
    };
  } catch (e) {
    console.error('[StyleAnalyzer] JSON 파싱 에러:', e);
    throw new Error('AI 응답 JSON 파싱에 실패했습니다.');
  }
}

/**
 * 여러 분석 결과 합성
 */
function mergeAnalysisResults(results: StyleAnalysisResult[]): StyleAnalysisResult {
  if (results.length === 0) {
    throw new Error('합성할 분석 결과가 없습니다.');
  }

  if (results.length === 1) {
    return results[0];
  }

  // 가장 높은 confidence를 가진 결과를 기준으로
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  const primary = sorted[0];

  // bestSamples, avoidPatterns, favorPatterns는 모든 결과에서 수집
  const allBestSamples = results.flatMap(r => r.bestSamples);
  const allAvoidPatterns = [...new Set(results.flatMap(r => r.avoidPatterns))];
  const allFavorPatterns = [...new Set(results.flatMap(r => r.favorPatterns))];

  return {
    proseStyle: primary.proseStyle,
    rhythmPattern: primary.rhythmPattern,
    dialogueStyle: primary.dialogueStyle,
    emotionExpression: primary.emotionExpression,
    sceneTransition: primary.sceneTransition,
    actionDescription: primary.actionDescription,
    bestSamples: allBestSamples.slice(0, 5),
    avoidPatterns: allAvoidPatterns.slice(0, 10),
    favorPatterns: allFavorPatterns.slice(0, 10),
    confidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
  };
}
