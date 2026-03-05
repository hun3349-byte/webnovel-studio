import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// GET: 프로젝트의 Writing Memory 목록 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';
    const feedbackType = searchParams.get('type');

    const supabase = createServiceRoleClient();

    let query = supabase
      .from('writing_memories')
      .select('*')
      .eq('project_id', projectId)
      .order('confidence', { ascending: false })
      .order('updated_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    if (feedbackType) {
      query = query.eq('feedback_type', feedbackType);
    }

    const { data: memories, error } = await query;

    if (error) {
      console.error('Writing memories fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 타입별 그룹화
    const byType = (memories || []).reduce((acc, mem) => {
      if (!acc[mem.feedback_type]) {
        acc[mem.feedback_type] = [];
      }
      acc[mem.feedback_type].push(mem);
      return acc;
    }, {} as Record<string, typeof memories>);

    // 통계
    const stats = {
      total: memories?.length || 0,
      active: memories?.filter(m => m.is_active).length || 0,
      byType: Object.fromEntries(
        Object.entries(byType).map(([type, items]) => [type, items?.length || 0])
      ),
      avgConfidence: memories?.length
        ? (memories.reduce((sum, m) => sum + (m.confidence || 0), 0) / memories.length).toFixed(2)
        : 0,
    };

    return NextResponse.json({ memories: memories || [], byType, stats });
  } catch (error) {
    console.error('Writing memories API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: 새 Writing Memory 생성 (피드백 학습)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();

    // 필수 필드 검증
    if (!body.feedback_type) {
      return NextResponse.json({ error: 'feedback_type is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 사용자 ID는 실제로는 인증에서 가져와야 함
    // 현재는 임시로 고정값 사용
    const userId = body.user_id || '00000000-0000-0000-0000-000000000000';

    const { data: memory, error } = await supabase
      .from('writing_memories')
      .insert({
        project_id: projectId,
        user_id: userId,
        feedback_type: body.feedback_type,
        original_text: body.original_text || null,
        edited_text: body.edited_text || null,
        preference_summary: body.preference_summary || null,
        avoid_patterns: body.avoid_patterns || [],
        favor_patterns: body.favor_patterns || [],
        confidence: body.confidence || 0.5,
        is_active: body.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('Writing memory create error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ memory }, { status: 201 });
  } catch (error) {
    console.error('Writing memory create API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
