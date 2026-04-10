import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  quickValidate,
  validateEpisode,
  validateFirstEpisode,
} from '@/core/engine/commercial-validator';
import { getWritingDNA } from '@/core/style/writing-dna';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      content,
      episodeNumber,
      mode = 'full',
      projectId,
    }: {
      content: string;
      episodeNumber?: number;
      mode?: 'full' | 'quick' | 'first-episode';
      projectId?: string;
    } = body;

    if (content === undefined || content === null) {
      return NextResponse.json({ error: 'content 필드가 필요합니다.' }, { status: 400 });
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: '에피소드 내용이 비어 있습니다.' }, { status: 400 });
    }

    if (content.trim().length < 100) {
      return NextResponse.json(
        { error: '에피소드 내용이 너무 짧습니다. 최소 100자 이상 작성해주세요.' },
        { status: 400 }
      );
    }

    const writingDna = projectId ? await getWritingDNA(projectId) : null;

    if (mode === 'quick') {
      const result = quickValidate(content, { writingDna });
      return NextResponse.json({ mode: 'quick', result });
    }

    if (mode === 'first-episode') {
      const result = validateFirstEpisode(content, { writingDna });
      return NextResponse.json({ mode: 'first-episode', result });
    }

    const result = validateEpisode(content, { writingDna });

    if (episodeNumber === 1) {
      const firstEpResult = validateFirstEpisode(content, { writingDna });
      return NextResponse.json({
        mode: 'full',
        result,
        firstEpisodeChecks: firstEpResult.firstEpisodeChecks,
      });
    }

    return NextResponse.json({ mode: 'full', result });
  } catch (error) {
    console.error('Quality validation error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Validation failed',
      },
      { status: 500 }
    );
  }
}
