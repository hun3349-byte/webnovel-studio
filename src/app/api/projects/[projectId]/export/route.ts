import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  formatForNaver,
  batchFormatForNaver,
  generateNaverPreviewHtml,
  type NaverExportOptions,
} from '@/lib/export/naver-formatter';
import {
  formatForMunpia,
  batchFormatForMunpia,
  mergeEpisodesForMunpia,
  type MunpiaExportOptions,
} from '@/lib/export/munpia-formatter';

// POST: 에피소드 내보내기
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      platform,
      episodeIds,
      options = {},
      merge = false,
    } = body as {
      platform: 'naver' | 'munpia';
      episodeIds?: string[];
      options?: Partial<NaverExportOptions | MunpiaExportOptions>;
      merge?: boolean;
    };

    if (!platform) {
      return NextResponse.json({ error: 'platform is required' }, { status: 400 });
    }

    // 에피소드 조회
    let query = supabase
      .from('episodes')
      .select('id, episode_number, title, content, char_count, status')
      .eq('project_id', projectId)
      .order('episode_number', { ascending: true });

    if (episodeIds && episodeIds.length > 0) {
      query = query.in('id', episodeIds);
    } else {
      // 기본: 발행된 에피소드만
      query = query.eq('status', 'published');
    }

    const { data: episodes, error } = await query;

    if (error) {
      console.error('Episodes fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!episodes || episodes.length === 0) {
      return NextResponse.json(
        { error: '내보낼 에피소드가 없습니다.' },
        { status: 404 }
      );
    }

    // 프로젝트 정보 조회 (소설 제목)
    const { data: project } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single();

    const novelTitle = project?.title || '제목 없음';

    // 플랫폼별 변환
    if (platform === 'naver') {
      const results = batchFormatForNaver(
        episodes.map(ep => ({
          content: ep.content,
          title: ep.title || `${ep.episode_number}화`,
          episodeNumber: ep.episode_number,
        })),
        options as Partial<NaverExportOptions>
      );

      // 미리보기 HTML 생성
      const previews = results.map(r => ({
        episodeNumber: r.episodeNumber,
        title: r.title,
        charCount: r.charCount,
        wordCount: r.wordCount,
        warnings: r.warnings,
        previewHtml: generateNaverPreviewHtml(r),
      }));

      return NextResponse.json({
        platform: 'naver',
        novelTitle,
        episodeCount: results.length,
        totalCharCount: results.reduce((sum, r) => sum + r.charCount, 0),
        results: results.map(r => ({
          episodeNumber: r.episodeNumber,
          title: r.title,
          content: r.content,
          charCount: r.charCount,
          wordCount: r.wordCount,
          warnings: r.warnings,
        })),
        previews,
      });
    } else if (platform === 'munpia') {
      const results = batchFormatForMunpia(
        episodes.map(ep => ({
          content: ep.content,
          title: ep.title || `${ep.episode_number}화`,
          episodeNumber: ep.episode_number,
        })),
        options as Partial<MunpiaExportOptions>
      );

      // 병합 옵션
      let mergedContent: string | null = null;
      if (merge) {
        mergedContent = mergeEpisodesForMunpia(results, novelTitle);
      }

      return NextResponse.json({
        platform: 'munpia',
        novelTitle,
        episodeCount: results.length,
        totalCharCount: results.reduce((sum, r) => sum + r.charCount, 0),
        results: results.map(r => ({
          episodeNumber: r.episodeNumber,
          title: r.title,
          content: r.content,
          charCount: r.charCount,
          lineCount: r.lineCount,
          paragraphCount: r.paragraphCount,
          warnings: r.warnings,
        })),
        merged: mergedContent,
      });
    }

    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  } catch (error) {
    console.error('Export API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET: 내보내기 가능한 에피소드 목록
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 에피소드 목록
    const { data: episodes, error } = await supabase
      .from('episodes')
      .select('id, episode_number, title, char_count, status, published_at')
      .eq('project_id', projectId)
      .order('episode_number', { ascending: true });

    if (error) {
      console.error('Episodes fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 프로젝트 정보
    const { data: project } = await supabase
      .from('projects')
      .select('title, genre, target_platform')
      .eq('id', projectId)
      .single();

    // 통계
    const published = episodes?.filter(e => e.status === 'published') || [];
    const totalCharCount = published.reduce((sum, e) => sum + (e.char_count || 0), 0);

    return NextResponse.json({
      project: {
        title: project?.title,
        genre: project?.genre,
        targetPlatform: project?.target_platform,
      },
      episodes: episodes || [],
      stats: {
        total: episodes?.length || 0,
        published: published.length,
        totalCharCount,
        avgCharCount: published.length > 0 ? Math.round(totalCharCount / published.length) : 0,
      },
    });
  } catch (error) {
    console.error('Export GET API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
