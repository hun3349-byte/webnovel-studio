import { NextRequest, NextResponse } from 'next/server';
import {
  validateEpisode,
  validateFirstEpisode,
  quickValidate,
} from '@/core/engine/commercial-validator';

// POST: 에피소드 퀄리티 검증
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, episodeNumber, mode = 'full' } = body as {
      content: string;
      episodeNumber?: number;
      mode?: 'full' | 'quick' | 'first-episode';
    };

    if (content === undefined || content === null) {
      return NextResponse.json({ error: 'content 필드가 필요합니다' }, { status: 400 });
    }

    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: '에피소드 내용이 비어있습니다' }, { status: 400 });
    }

    if (content.trim().length < 100) {
      return NextResponse.json({ error: '에피소드 내용이 너무 짧습니다 (최소 100자)' }, { status: 400 });
    }

    let result;

    switch (mode) {
      case 'quick':
        result = quickValidate(content);
        return NextResponse.json({ mode: 'quick', result });

      case 'first-episode':
        result = validateFirstEpisode(content);
        return NextResponse.json({ mode: 'first-episode', result });

      case 'full':
      default:
        result = validateEpisode(content);

        // 1화인 경우 추가 검증
        if (episodeNumber === 1) {
          const firstEpResult = validateFirstEpisode(content);
          return NextResponse.json({
            mode: 'full',
            result,
            firstEpisodeChecks: firstEpResult.firstEpisodeChecks,
          });
        }

        return NextResponse.json({ mode: 'full', result });
    }
  } catch (error) {
    console.error('Quality validation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Validation failed' },
      { status: 500 }
    );
  }
}
