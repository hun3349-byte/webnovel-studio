import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface EpisodeSynopsis {
  id: string;
  project_id: string;
  episode_number: number;
  title: string | null;
  synopsis: string;
  goals: string[] | null;
  key_events: string[] | null;
  featured_characters: string[] | null;
  location: string | null;
  time_context: string | null;
  arc_name: string | null;
  arc_position: string | null;
  foreshadowing: string[] | null;
  callbacks: string[] | null;
  notes: string | null;
  is_written: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/projects/[projectId]/story-bible
 * 프로젝트의 모든 에피소드 시놉시스 조회
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    const { data, error } = await supabase
      .from('episode_synopses')
      .select('*')
      .eq('project_id', projectId)
      .order('episode_number', { ascending: true });

    if (error) {
      console.error('[StoryBible GET] Error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      synopses: data as EpisodeSynopsis[],
      count: data?.length || 0,
    });
  } catch (error) {
    console.error('[StoryBible GET] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch story bible' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/[projectId]/story-bible
 * 새 에피소드 시놉시스 생성
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    const {
      episode_number,
      title,
      synopsis,
      goals,
      key_events,
      featured_characters,
      location,
      time_context,
      arc_name,
      arc_position,
      foreshadowing,
      callbacks,
      notes,
    } = body;

    if (!episode_number || episode_number < 1) {
      return NextResponse.json(
        { error: '에피소드 번호는 1 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    if (!synopsis?.trim()) {
      return NextResponse.json(
        { error: '시놉시스를 입력해주세요.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('episode_synopses')
      .insert({
        project_id: projectId,
        episode_number,
        title: title || null,
        synopsis: synopsis.trim(),
        goals: goals || null,
        key_events: key_events || null,
        featured_characters: featured_characters || null,
        location: location || null,
        time_context: time_context || null,
        arc_name: arc_name || null,
        arc_position: arc_position || null,
        foreshadowing: foreshadowing || null,
        callbacks: callbacks || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[StoryBible POST] Error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `${episode_number}화 시놉시스가 이미 존재합니다.` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      synopsis: data as EpisodeSynopsis,
    });
  } catch (error) {
    console.error('[StoryBible POST] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create synopsis' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/projects/[projectId]/story-bible
 * 다중 시놉시스 일괄 업데이트/생성 (Upsert)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { synopses } = body as { synopses: Partial<EpisodeSynopsis>[] };

    if (!synopses || !Array.isArray(synopses)) {
      return NextResponse.json(
        { error: 'synopses 배열이 필요합니다.' },
        { status: 400 }
      );
    }

    const results = [];
    const errors = [];

    for (const synopsis of synopses) {
      // episode_number 검증 (1 이상이어야 함)
      if (!synopsis.episode_number || synopsis.episode_number < 1) {
        errors.push(`잘못된 에피소드 번호: ${synopsis.episode_number}`);
        continue;
      }
      if (!synopsis.synopsis?.trim()) {
        errors.push(`${synopsis.episode_number}화: 시놉시스가 비어있습니다.`);
        continue;
      }

      const { data, error } = await supabase
        .from('episode_synopses')
        .upsert(
          {
            project_id: projectId,
            episode_number: synopsis.episode_number,
            title: synopsis.title || null,
            synopsis: synopsis.synopsis.trim(),
            goals: synopsis.goals || null,
            key_events: synopsis.key_events || null,
            featured_characters: synopsis.featured_characters || null,
            location: synopsis.location || null,
            time_context: synopsis.time_context || null,
            arc_name: synopsis.arc_name || null,
            arc_position: synopsis.arc_position || null,
            foreshadowing: synopsis.foreshadowing || null,
            callbacks: synopsis.callbacks || null,
            notes: synopsis.notes || null,
          },
          { onConflict: 'project_id,episode_number' }
        )
        .select()
        .single();

      if (error) {
        errors.push(`${synopsis.episode_number}화: ${error.message}`);
      } else {
        results.push(data);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      updated: results.length,
      errors: errors.length > 0 ? errors : undefined,
      synopses: results,
    });
  } catch (error) {
    console.error('[StoryBible PUT] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // 테이블이 없는 경우 등 DB 에러 상세 메시지
    if (errorMessage.includes('relation') && errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: 'episode_synopses 테이블이 존재하지 않습니다. DB 마이그레이션을 실행해주세요.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `스토리 바이블 저장 실패: ${errorMessage}` },
      { status: 500 }
    );
  }
}
