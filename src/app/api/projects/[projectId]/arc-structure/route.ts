/**
 * Arc Structure API
 * Phase 1: 전체 아크 구조 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchArcStructureSummary } from '@/core/memory/sliding-window-builder';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const episodeNumber = parseInt(searchParams.get('episodeNumber') || '1');

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const arcStructure = await fetchArcStructureSummary(projectId, episodeNumber);

    return NextResponse.json({ arcStructure });
  } catch (error) {
    console.error('[arc-structure] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch arc structure' },
      { status: 500 }
    );
  }
}
