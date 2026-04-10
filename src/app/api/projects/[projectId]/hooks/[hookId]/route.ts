import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string; hookId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, hookId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.summary !== undefined) updateData.summary = body.summary;
    if (body.detail !== undefined) updateData.detail = body.detail;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.importance !== undefined) updateData.importance = body.importance;
    if (body.hook_type !== undefined) updateData.hook_type = body.hook_type;
    if (body.keywords !== undefined) updateData.keywords = body.keywords;

    const { data, error } = await supabase
      .from('story_hooks')
      .update(updateData)
      .eq('id', hookId)
      .eq('project_id', projectId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ hook: data });
  } catch (error) {
    console.error('[Hook PATCH] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update hook' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, hookId } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { error } = await supabase
      .from('story_hooks')
      .delete()
      .eq('id', hookId)
      .eq('project_id', projectId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Hook DELETE] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete hook' },
      { status: 500 }
    );
  }
}
