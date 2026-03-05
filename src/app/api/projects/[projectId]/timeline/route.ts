import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

// GET: 타임라인 데이터 조회 (에피소드 + 로그 + 떡밥 통합)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = createServiceRoleClient();

    // 병렬로 모든 데이터 가져오기
    const [episodesResult, logsResult, hooksResult, charactersResult] = await Promise.all([
      // 에피소드 목록
      supabase
        .from('episodes')
        .select('id, episode_number, title, char_count, status, log_status, created_at, published_at')
        .eq('project_id', projectId)
        .order('episode_number', { ascending: true }),

      // 에피소드 로그 (요약)
      supabase
        .from('episode_logs')
        .select('episode_id, episode_number, summary, is_fallback')
        .eq('project_id', projectId)
        .order('episode_number', { ascending: true }),

      // 모든 떡밥 (생성/해결 모두)
      supabase
        .from('story_hooks')
        .select('id, hook_type, summary, status, importance, created_in_episode_number, resolved_in_episode_number, keywords, related_character_ids')
        .eq('project_id', projectId)
        .order('created_in_episode_number', { ascending: true }),

      // 캐릭터 목록 (이름/역할만)
      supabase
        .from('characters')
        .select('id, name, role, first_appearance_episode, last_appearance_episode, is_alive')
        .eq('project_id', projectId)
        .order('first_appearance_episode', { ascending: true, nullsFirst: false }),
    ]);

    if (episodesResult.error) {
      console.error('Episodes fetch error:', episodesResult.error);
      return NextResponse.json({ error: episodesResult.error.message }, { status: 500 });
    }

    // 에피소드별 로그 매핑
    type LogType = { episode_id: string; episode_number: number; summary: string; is_fallback: boolean | null };
    const logsByEpisode = new Map<number, LogType>();
    (logsResult.data || []).forEach(log => {
      logsByEpisode.set(log.episode_number, log);
    });

    // 에피소드별 떡밥 매핑 (생성/해결)
    type HookType = NonNullable<typeof hooksResult.data>[number];
    const hooksByEpisode = new Map<number, { created: HookType[], resolved: HookType[] }>();
    (hooksResult.data || []).forEach(hook => {
      // 생성된 에피소드
      const createdEp = hook.created_in_episode_number;
      if (!hooksByEpisode.has(createdEp)) {
        hooksByEpisode.set(createdEp, { created: [], resolved: [] });
      }
      hooksByEpisode.get(createdEp)!.created.push(hook);

      // 해결된 에피소드
      if (hook.resolved_in_episode_number) {
        const resolvedEp = hook.resolved_in_episode_number;
        if (!hooksByEpisode.has(resolvedEp)) {
          hooksByEpisode.set(resolvedEp, { created: [], resolved: [] });
        }
        hooksByEpisode.get(resolvedEp)!.resolved.push(hook);
      }
    });

    // 캐릭터별 첫 등장 에피소드 매핑
    const charactersByFirstAppearance = new Map<number, typeof charactersResult.data>();
    (charactersResult.data || []).forEach(char => {
      if (char.first_appearance_episode) {
        const ep = char.first_appearance_episode;
        if (!charactersByFirstAppearance.has(ep)) {
          charactersByFirstAppearance.set(ep, []);
        }
        charactersByFirstAppearance.get(ep)!.push(char);
      }
    });

    // 타임라인 데이터 구성
    const timeline = (episodesResult.data || []).map(episode => ({
      episode: {
        id: episode.id,
        number: episode.episode_number,
        title: episode.title,
        charCount: episode.char_count,
        status: episode.status,
        logStatus: episode.log_status,
        createdAt: episode.created_at,
        publishedAt: episode.published_at,
      },
      log: logsByEpisode.get(episode.episode_number) || null,
      hooks: hooksByEpisode.get(episode.episode_number) || { created: [], resolved: [] },
      newCharacters: charactersByFirstAppearance.get(episode.episode_number) || [],
    }));

    // 통계
    const stats = {
      totalEpisodes: episodesResult.data?.length || 0,
      publishedEpisodes: episodesResult.data?.filter(e => e.status === 'published').length || 0,
      totalCharCount: episodesResult.data?.reduce((sum, e) => sum + (e.char_count || 0), 0) || 0,
      openHooks: hooksResult.data?.filter(h => h.status === 'open').length || 0,
      resolvedHooks: hooksResult.data?.filter(h => h.status === 'resolved').length || 0,
      totalCharacters: charactersResult.data?.length || 0,
    };

    return NextResponse.json({
      timeline,
      stats,
      characters: charactersResult.data || [],
      hooks: hooksResult.data || [],
    });
  } catch (error) {
    console.error('Timeline API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
