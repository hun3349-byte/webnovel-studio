import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string; characterId: string }>;
}

// GET /api/projects/[projectId]/characters/[characterId] - 캐릭터 상세 조회
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, characterId } = await params;
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .eq('project_id', projectId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 });
      }
      throw error;
    }

    // 캐릭터 메모리(트라우마, 특성 등)도 함께 조회
    const { data: memories } = await supabase
      .from('character_memories')
      .select('*')
      .eq('character_id', characterId)
      .order('importance', { ascending: false });

    return NextResponse.json({ character: data, memories: memories || [] });
  } catch (error) {
    console.error('Character fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch character' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/characters/[characterId] - 캐릭터 수정
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, characterId } = await params;
    const body = await request.json();

    const supabase = createServiceRoleClient();

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    const allowedFields = [
      'name', 'role', 'age', 'gender', 'appearance', 'personality',
      'speech_pattern', 'backstory', 'goals', 'is_alive', 'current_location',
      'emotional_state', 'possessed_items', 'injuries', 'status_effects', 'additional_data'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('characters')
      .update(updateData)
      .eq('id', characterId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ character: data });
  } catch (error) {
    console.error('Character update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update character' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/characters/[characterId] - 캐릭터 삭제
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, characterId } = await params;
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('characters')
      .delete()
      .eq('id', characterId)
      .eq('project_id', projectId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Character delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete character' },
      { status: 500 }
    );
  }
}
