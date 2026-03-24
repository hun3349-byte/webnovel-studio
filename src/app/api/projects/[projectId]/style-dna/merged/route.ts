// ============================================================================
// API: /api/projects/[projectId]/style-dna/merged
// 합성된 StyleDNA 조회
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { getMergedDNA, getActiveStyleDNAs } from '@/core/style/style-dna-manager';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

// ============================================================================
// GET: 합성된 StyleDNA 조회
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

    const mergedDNA = await getMergedDNA(projectId);

    // 활성 DNA 수 조회 (없으면 합성 DNA가 없을 수 있음)
    const activeDNAs = await getActiveStyleDNAs(projectId);

    return NextResponse.json({
      mergedDNA,
      hasMergedDNA: mergedDNA !== null,
      activeDNACount: activeDNAs.length,
      needsMerge: activeDNAs.length > 0 && mergedDNA === null,
      lastMergedAt: mergedDNA?.lastMergedAt || null,
    });
  } catch (error) {
    console.error('[style-dna/merged GET] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch merged DNA' },
      { status: 500 }
    );
  }
}
