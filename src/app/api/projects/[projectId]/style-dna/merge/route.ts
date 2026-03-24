// ============================================================================
// API: /api/projects/[projectId]/style-dna/merge
// 합성 DNA 재생성
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { mergeDNAs, getActiveStyleDNAs } from '@/core/style/style-dna-manager';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// ============================================================================
// POST: 합성 DNA 재생성
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

    // 활성 DNA 확인
    const activeDNAs = await getActiveStyleDNAs(projectId);

    if (activeDNAs.length === 0) {
      return NextResponse.json(
        { error: '합성할 활성 StyleDNA가 없습니다. 먼저 레퍼런스를 추가하세요.' },
        { status: 400 }
      );
    }

    console.log(`[merge] ${activeDNAs.length}개 DNA 합성 시작`);

    const mergedDNA = await mergeDNAs(projectId);

    console.log(`[merge] 합성 완료: v${mergedDNA.version}`);

    return NextResponse.json({
      success: true,
      mergedDNA,
      sourceCount: activeDNAs.length,
      message: `${activeDNAs.length}개의 StyleDNA를 합성했습니다.`,
    });
  } catch (error) {
    console.error('[style-dna/merge] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'DNA 합성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
