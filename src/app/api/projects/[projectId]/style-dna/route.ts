// ============================================================================
// API: /api/projects/[projectId]/style-dna
// StyleDNA 목록 조회 (GET) / 수동 추가 (POST)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getStyleDNAs, saveStyleDNA, mergeDNAs } from '@/core/style/style-dna-manager';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// ============================================================================
// GET: StyleDNA 목록 조회
// ============================================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId는 필수입니다.' },
        { status: 400 }
      );
    }

    // 쿼리 파라미터
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';

    const dnas = await getStyleDNAs(projectId, activeOnly);

    // 통계 계산
    const stats = {
      total: dnas.length,
      active: dnas.filter(d => d.isActive).length,
      referenceCount: dnas.filter(d => d.sourceType === 'reference').length,
      pdFeedbackCount: dnas.filter(d => d.sourceType === 'pd_feedback').length,
      manualCount: dnas.filter(d => d.sourceType === 'manual').length,
    };

    return NextResponse.json({ dnas, stats });
  } catch (error) {
    console.error('[style-dna GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch style DNAs' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST: StyleDNA 수동 추가
// ============================================================================
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'projectId는 필수입니다.' },
        { status: 400 }
      );
    }

    const body = await request.json();

    // 필수 필드 검증
    if (!body.sourceName) {
      return NextResponse.json(
        { error: 'sourceName은 필수입니다.' },
        { status: 400 }
      );
    }

    // 최소한 하나의 DNA 요소가 있어야 함
    const hasContent = body.proseStyle || body.rhythmPattern || body.dialogueStyle ||
      body.emotionExpression || body.sceneTransition || body.actionDescription ||
      (body.avoidPatterns && body.avoidPatterns.length > 0) ||
      (body.favorPatterns && body.favorPatterns.length > 0);

    if (!hasContent) {
      return NextResponse.json(
        { error: '최소한 하나의 DNA 요소가 필요합니다.' },
        { status: 400 }
      );
    }

    // StyleDNA 저장
    const styleDNA = await saveStyleDNA(
      projectId,
      body.sourceName,
      body.sourceType || 'manual',
      {
        proseStyle: body.proseStyle || null,
        rhythmPattern: body.rhythmPattern || null,
        dialogueStyle: body.dialogueStyle || null,
        emotionExpression: body.emotionExpression || null,
        sceneTransition: body.sceneTransition || null,
        actionDescription: body.actionDescription || null,
        bestSamples: body.bestSamples || [],
        avoidPatterns: body.avoidPatterns || [],
        favorPatterns: body.favorPatterns || [],
        confidence: body.confidence || 0.7,
      }
    );

    // 합성 DNA 재생성
    let mergedDNA = null;
    try {
      mergedDNA = await mergeDNAs(projectId);
    } catch (mergeError) {
      console.warn('[style-dna POST] 합성 DNA 재생성 실패:', mergeError);
    }

    return NextResponse.json({
      success: true,
      styleDNA,
      mergedDNA,
    });
  } catch (error) {
    console.error('[style-dna POST] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create style DNA' },
      { status: 500 }
    );
  }
}
