// ============================================================================
// API: /api/projects/[projectId]/style-dna/[dnaId]
// 개별 StyleDNA 조회 (GET) / 수정 (PATCH) / 삭제 (DELETE)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getStyleDNA,
  updateStyleDNA,
  deleteStyleDNA,
  mergeDNAs,
} from '@/core/style/style-dna-manager';

interface RouteParams {
  params: Promise<{ projectId: string; dnaId: string }>;
}

// ============================================================================
// GET: 개별 StyleDNA 조회
// ============================================================================
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, dnaId } = await params;

    if (!dnaId) {
      return NextResponse.json(
        { error: 'dnaId는 필수입니다.' },
        { status: 400 }
      );
    }

    const styleDNA = await getStyleDNA(dnaId);

    if (!styleDNA) {
      return NextResponse.json(
        { error: 'StyleDNA를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // projectId 검증
    if (styleDNA.projectId !== projectId) {
      return NextResponse.json(
        { error: '해당 프로젝트의 StyleDNA가 아닙니다.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ styleDNA });
  } catch (error) {
    console.error('[style-dna/[dnaId] GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch style DNA' },
      { status: 500 }
    );
  }
}

// ============================================================================
// PATCH: StyleDNA 수정
// ============================================================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, dnaId } = await params;

    if (!dnaId) {
      return NextResponse.json(
        { error: 'dnaId는 필수입니다.' },
        { status: 400 }
      );
    }

    // 기존 DNA 확인
    const existing = await getStyleDNA(dnaId);
    if (!existing) {
      return NextResponse.json(
        { error: 'StyleDNA를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (existing.projectId !== projectId) {
      return NextResponse.json(
        { error: '해당 프로젝트의 StyleDNA가 아닙니다.' },
        { status: 403 }
      );
    }

    const body = await request.json();

    // 허용된 필드만 업데이트
    const allowedFields = [
      'sourceName', 'proseStyle', 'rhythmPattern', 'dialogueStyle',
      'emotionExpression', 'sceneTransition', 'actionDescription',
      'bestSamples', 'avoidPatterns', 'favorPatterns',
      'confidence', 'weight', 'isActive',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: '수정할 필드가 없습니다.' },
        { status: 400 }
      );
    }

    const styleDNA = await updateStyleDNA(dnaId, updates);

    // isActive가 변경되었으면 합성 DNA 재생성
    if ('isActive' in updates) {
      try {
        await mergeDNAs(projectId);
      } catch (mergeError) {
        console.warn('[style-dna PATCH] 합성 DNA 재생성 실패:', mergeError);
      }
    }

    return NextResponse.json({
      success: true,
      styleDNA,
    });
  } catch (error) {
    console.error('[style-dna/[dnaId] PATCH] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update style DNA' },
      { status: 500 }
    );
  }
}

// ============================================================================
// DELETE: StyleDNA 삭제
// ============================================================================
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, dnaId } = await params;

    if (!dnaId) {
      return NextResponse.json(
        { error: 'dnaId는 필수입니다.' },
        { status: 400 }
      );
    }

    // 기존 DNA 확인
    const existing = await getStyleDNA(dnaId);
    if (!existing) {
      return NextResponse.json(
        { error: 'StyleDNA를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (existing.projectId !== projectId) {
      return NextResponse.json(
        { error: '해당 프로젝트의 StyleDNA가 아닙니다.' },
        { status: 403 }
      );
    }

    await deleteStyleDNA(dnaId);

    // 합성 DNA 재생성
    try {
      await mergeDNAs(projectId);
    } catch (mergeError) {
      console.warn('[style-dna DELETE] 합성 DNA 재생성 실패:', mergeError);
    }

    return NextResponse.json({
      success: true,
      message: 'StyleDNA가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('[style-dna/[dnaId] DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete style DNA' },
      { status: 500 }
    );
  }
}
