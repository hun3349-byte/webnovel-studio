import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

interface DuplicateSummary {
  worldBible: boolean;
  characters: number;
  characterMemories: number;
  characterRelationships: number;
  timelineEvents: number;
  systemSettings: number;
}

// POST /api/projects/[projectId]/duplicate - 프로젝트 복사
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    // 인증 확인
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 원본 프로젝트 조회
    const { data: originalProject, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !originalProject) {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 새 프로젝트 생성
    const newProjectId = uuidv4();
    const newTitle = `${originalProject.title} (사본)`;

    const { data: newProject, error: createError } = await supabase
      .from('projects')
      .insert({
        id: newProjectId,
        user_id: user.id,
        title: newTitle,
        genre: originalProject.genre,
        target_platform: originalProject.target_platform,
        status: 'draft',
        generation_mode: originalProject.generation_mode,
        generation_config: originalProject.generation_config,
        total_episodes: 0,
      })
      .select()
      .single();

    if (createError || !newProject) {
      throw new Error('프로젝트 생성 실패: ' + createError?.message);
    }

    const summary: DuplicateSummary = {
      worldBible: false,
      characters: 0,
      characterMemories: 0,
      characterRelationships: 0,
      timelineEvents: 0,
      systemSettings: 0,
    };

    // 캐릭터 ID 매핑
    const characterIdMap = new Map<string, string>();

    try {
      // 1. World Bible 복사
      const { data: worldBible } = await supabase
        .from('world_bibles')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (worldBible) {
        const { id: _, project_id: __, created_at: ___, updated_at: ____, ...worldBibleData } = worldBible;
        await supabase.from('world_bibles').insert({
          ...worldBibleData,
          id: uuidv4(),
          project_id: newProjectId,
        });
        summary.worldBible = true;
      }

      // 2. Characters 복사
      const { data: characters } = await supabase
        .from('characters')
        .select('*')
        .eq('project_id', projectId);

      if (characters && characters.length > 0) {
        for (const char of characters) {
          const newCharId = uuidv4();
          characterIdMap.set(char.id, newCharId);

          const { id: _, project_id: __, created_at: ___, updated_at: ____, ...charData } = char;
          await supabase.from('characters').insert({
            ...charData,
            id: newCharId,
            project_id: newProjectId,
            // 에피소드 참조 초기화
            first_appearance_episode: null,
            last_appearance_episode: null,
          });
        }
        summary.characters = characters.length;
      }

      // 3. Character Memories 복사
      const { data: memories } = await supabase
        .from('character_memories')
        .select('*')
        .eq('project_id', projectId);

      if (memories && memories.length > 0) {
        for (const mem of memories) {
          const newCharId = characterIdMap.get(mem.character_id);
          if (!newCharId) continue;

          const { id: _, project_id: __, character_id: ___, created_at: ____, source_episode_id: _____, ...memData } = mem;

          // related_character_ids 매핑
          let mappedRelatedIds: string[] | null = null;
          if (memData.related_character_ids) {
            mappedRelatedIds = memData.related_character_ids
              .map(id => characterIdMap.get(id))
              .filter((id): id is string => !!id);
          }

          await supabase.from('character_memories').insert({
            ...memData,
            id: uuidv4(),
            project_id: newProjectId,
            character_id: newCharId,
            source_episode_id: null, // 에피소드 없음
            source_episode_number: null,
            related_character_ids: mappedRelatedIds,
          });
        }
        summary.characterMemories = memories.length;
      }

      // 4. Character Relationships 복사
      const { data: relationships } = await supabase
        .from('character_relationships')
        .select('*')
        .eq('project_id', projectId);

      if (relationships && relationships.length > 0) {
        for (const rel of relationships) {
          const newCharAId = characterIdMap.get(rel.character_a_id);
          const newCharBId = characterIdMap.get(rel.character_b_id);
          if (!newCharAId || !newCharBId) continue;

          const { id: _, project_id: __, character_a_id: ___, character_b_id: ____, created_at: _____, updated_at: ______, ...relData } = rel;
          await supabase.from('character_relationships').insert({
            ...relData,
            id: uuidv4(),
            project_id: newProjectId,
            character_a_id: newCharAId,
            character_b_id: newCharBId,
          });
        }
        summary.characterRelationships = relationships.length;
      }

      // 5. Timeline Events 복사
      const { data: timelineEvents } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('project_id', projectId);

      if (timelineEvents && timelineEvents.length > 0) {
        for (const event of timelineEvents) {
          const { id: _, project_id: __, created_at: ___, updated_at: ____, ...eventData } = event;

          // key_characters 매핑
          let mappedKeyChars: string[] | null = null;
          if (eventData.key_characters) {
            mappedKeyChars = eventData.key_characters
              .map(id => characterIdMap.get(id))
              .filter((id): id is string => !!id);
          }

          await supabase.from('timeline_events').insert({
            ...eventData,
            id: uuidv4(),
            project_id: newProjectId,
            key_characters: mappedKeyChars,
            status: 'planned', // 새로 시작
          });
        }
        summary.timelineEvents = timelineEvents.length;
      }

      // 6. System Settings 복사
      const { data: settings } = await supabase
        .from('system_settings')
        .select('*')
        .eq('project_id', projectId);

      if (settings && settings.length > 0) {
        for (const setting of settings) {
          const { id: _, project_id: __, created_at: ___, updated_at: ____, ...settingData } = setting;
          await supabase.from('system_settings').insert({
            ...settingData,
            id: uuidv4(),
            project_id: newProjectId,
          });
        }
        summary.systemSettings = settings.length;
      }

    } catch (copyError) {
      // 복사 중 에러 발생 시 생성된 프로젝트 삭제 시도
      console.error('복사 중 에러:', copyError);
      await supabase.from('projects').delete().eq('id', newProjectId);
      throw copyError;
    }

    return NextResponse.json({
      project: newProject,
      summary,
      redirectUrl: `/projects/${newProjectId}`,
    });

  } catch (error) {
    console.error('프로젝트 복사 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '프로젝트 복사에 실패했습니다.' },
      { status: 500 }
    );
  }
}
