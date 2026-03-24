// ============================================================================
// API: /api/ai/analyze-style
// 레퍼런스 소설 텍스트 분석 → StyleDNA 생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { analyzeStyle, analyzeFullNovel } from '@/core/style/style-analyzer';
import { saveStyleDNA, mergeDNAs } from '@/core/style/style-dna-manager';
import type { StyleAnalysisRequest } from '@/types/style-dna';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60초 타임아웃 (분석에 시간이 걸림)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StyleAnalysisRequest;

    // 필수 필드 검증
    if (!body.projectId) {
      return NextResponse.json(
        { error: 'projectId는 필수입니다.' },
        { status: 400 }
      );
    }

    if (!body.text || body.text.length < 500) {
      return NextResponse.json(
        { error: '분석할 텍스트는 최소 500자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    if (!body.sourceName) {
      return NextResponse.json(
        { error: 'sourceName(출처 이름)은 필수입니다.' },
        { status: 400 }
      );
    }

    const sourceType = body.sourceType || 'reference';

    console.log(`[analyze-style] 분석 시작: ${body.sourceName} (${body.text.length}자)`);

    // 텍스트 길이에 따라 분석 방식 선택
    let analysis;
    if (body.text.length > 10000) {
      // 대용량: 3구간 샘플링 분석
      console.log('[analyze-style] 대용량 텍스트 - 3구간 샘플링 분석');
      analysis = await analyzeFullNovel(body.text, body.sourceName);
    } else {
      // 일반: 전체 분석
      analysis = await analyzeStyle(body.text);
    }

    console.log(`[analyze-style] 분석 완료, confidence: ${analysis.confidence}`);

    // StyleDNA 저장
    const styleDNA = await saveStyleDNA(
      body.projectId,
      body.sourceName,
      sourceType,
      analysis
    );

    console.log(`[analyze-style] StyleDNA 저장 완료: ${styleDNA.id}`);

    // 합성 DNA 재생성
    let mergedDNA = null;
    try {
      mergedDNA = await mergeDNAs(body.projectId);
      console.log(`[analyze-style] 합성 DNA 재생성 완료`);
    } catch (mergeError) {
      console.warn('[analyze-style] 합성 DNA 재생성 실패 (무시):', mergeError);
    }

    return NextResponse.json({
      success: true,
      styleDNA,
      mergedDNA,
      analysis: {
        proseStyle: analysis.proseStyle,
        rhythmPattern: analysis.rhythmPattern,
        dialogueStyle: analysis.dialogueStyle,
        emotionExpression: analysis.emotionExpression,
        sceneTransition: analysis.sceneTransition,
        actionDescription: analysis.actionDescription,
        confidence: analysis.confidence,
        bestSamplesCount: analysis.bestSamples.length,
        avoidPatternsCount: analysis.avoidPatterns.length,
        favorPatternsCount: analysis.favorPatterns.length,
      },
    });
  } catch (error) {
    console.error('[analyze-style] Error:', error);

    const message = error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.';

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
