/**
 * 씬 기반 에피소드 생성 API
 * Phase 3: 4분할 씬 기반 작성 모드
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { buildSlidingWindowContext } from '@/core/memory/sliding-window-builder';
import { generateEpisodeByScenes } from '@/core/engine/scene-based-writer';
import type { SceneBasedWritingInput } from '@/types/generation';

export const maxDuration = 300; // 5분 (4개 씬 생성)

interface RequestBody {
  projectId: string;
  episodeId?: string;
  targetEpisodeNumber: number;
  userInstruction: string;
  sceneBeats: [string, string, string, string];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body: RequestBody = await request.json();
    const { projectId, targetEpisodeNumber, userInstruction, sceneBeats } = body;

    // 유효성 검사
    if (!projectId || !targetEpisodeNumber || !userInstruction) {
      return NextResponse.json(
        { error: 'projectId, targetEpisodeNumber, userInstruction are required.' },
        { status: 400 }
      );
    }

    if (!sceneBeats || sceneBeats.length !== 4) {
      return NextResponse.json(
        { error: 'sceneBeats must be an array of 4 strings.' },
        { status: 400 }
      );
    }

    // 빈 씬비트 검사
    const emptyBeats = sceneBeats.filter((beat) => !beat.trim());
    if (emptyBeats.length > 0) {
      return NextResponse.json(
        { error: 'All 4 scene beats must have content.' },
        { status: 400 }
      );
    }

    // 슬라이딩 윈도우 컨텍스트 구축
    const context = await buildSlidingWindowContext(projectId, targetEpisodeNumber, {
      windowSize: 3,
    });

    if (!context) {
      return NextResponse.json(
        { error: 'Failed to build context for the project.' },
        { status: 500 }
      );
    }

    // 씬 기반 생성 실행
    const input: SceneBasedWritingInput = {
      projectId,
      targetEpisodeNumber,
      userInstruction,
      context,
      sceneBeats,
    };

    const result = await generateEpisodeByScenes(input);

    return NextResponse.json({
      success: true,
      mode: result.mode,
      fullText: result.fullText,
      scenes: result.scenes,
      totalCharCount: result.totalCharCount,
      totalInputTokens: result.totalInputTokens,
      totalOutputTokens: result.totalOutputTokens,
      totalLatencyMs: result.totalLatencyMs,
      promptMetadata: result.promptMetadata,
    });
  } catch (error) {
    console.error('[generate-prose-scene] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate scenes',
      },
      { status: 500 }
    );
  }
}
