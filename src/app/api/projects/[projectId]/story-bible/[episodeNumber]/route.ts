import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/projects/[projectId]/story-bible/[episodeNumber]
 * 특정 에피소드의 시놉시스 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; episodeNumber: string }> }
) {
  try {
    const { projectId, episodeNumber } = await params;
    const epNum = parseInt(episodeNumber, 10);

    if (isNaN(epNum) || epNum < 1) {
      return NextResponse.json(
        { error: '유효한 에피소드 번호가 필요합니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('episode_synopses')
      .select('*')
      .eq('project_id', projectId)
      .eq('episode_number', epNum)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: '시놉시스를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ synopsis: data });
  } catch (error) {
    console.error('[StoryBible Episode GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch synopsis' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/projects/[projectId]/story-bible/[episodeNumber]
 * 특정 에피소드의 시놉시스 수정
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; episodeNumber: string }> }
) {
  try {
    const { projectId, episodeNumber } = await params;
    const epNum = parseInt(episodeNumber, 10);
    const body = await request.json();

    if (isNaN(epNum) || epNum < 1) {
      return NextResponse.json(
        { error: '유효한 에피소드 번호가 필요합니다.' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'title', 'synopsis', 'goals', 'key_events', 'featured_characters',
      'location', 'time_context', 'arc_name', 'arc_position',
      'foreshadowing', 'callbacks', 'notes', 'is_written'
    ];

    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '수정할 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('episode_synopses')
      .update(updateData)
      .eq('project_id', projectId)
      .eq('episode_number', epNum)
      .select()
      .single();

    if (error) {
      console.error('[StoryBible Episode PATCH] Error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      synopsis: data,
    });
  } catch (error) {
    console.error('[StoryBible Episode PATCH] Error:', error);
    return NextResponse.json(
      { error: 'Failed to update synopsis' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[projectId]/story-bible/[episodeNumber]
 * 특정 에피소드의 시놉시스 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; episodeNumber: string }> }
) {
  try {
    const { projectId, episodeNumber } = await params;
    const epNum = parseInt(episodeNumber, 10);

    if (isNaN(epNum) || epNum < 1) {
      return NextResponse.json(
        { error: '유효한 에피소드 번호가 필요합니다.' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('episode_synopses')
      .delete()
      .eq('project_id', projectId)
      .eq('episode_number', epNum);

    if (error) {
      console.error('[StoryBible Episode DELETE] Error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${epNum}화 시놉시스가 삭제되었습니다.`,
    });
  } catch (error) {
    console.error('[StoryBible Episode DELETE] Error:', error);
    return NextResponse.json(
      { error: 'Failed to delete synopsis' },
      { status: 500 }
    );
  }
}
