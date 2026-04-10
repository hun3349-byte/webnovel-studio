'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getEpisodeEditorPath } from '@/lib/editor/get-episode-editor-path';

interface Episode {
  id: string;
  episode_number: number;
  title: string | null;
  char_count: number;
  status: 'draft' | 'generating' | 'review' | 'published';
  log_status: 'pending' | 'processing' | 'completed' | 'failed' | 'fallback';
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: '초안',
  generating: '생성 중',
  review: '검토 중',
  published: '발행됨',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-600',
  generating: 'bg-yellow-600',
  review: 'bg-blue-600',
  published: 'bg-green-600',
};

const LOG_STATUS_LABELS: Record<string, string> = {
  pending: '로그 대기',
  processing: '로그 생성 중',
  completed: '로그 완료',
  failed: '로그 실패',
  fallback: '임시 로그',
};

export default function EpisodesPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load episodes
  const loadEpisodes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/episodes`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      setEpisodes(data.episodes);
    } catch {
      setError('에피소드 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  // Create new episode
  const handleCreateEpisode = async () => {
    try {
      setCreating(true);
      const res = await fetch(`/api/projects/${projectId}/episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) throw new Error('Failed to create');

      const data = await res.json();
      const nextPath = getEpisodeEditorPath(projectId, data.episode.id);
      console.log('[EpisodesPage] navigate ->', nextPath);
      router.push(nextPath);
    } catch {
      alert('에피소드 생성에 실패했습니다.');
      setCreating(false);
    }
  };

  // Delete episode
  const handleDelete = async (episode: Episode) => {
    if (!confirm(`${episode.episode_number}화를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/episodes/${episode.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete');

      loadEpisodes();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  // Get char count color
  const getCharCountColor = (count: number) => {
    if (count < 4000) return 'text-red-400';
    if (count > 6000) return 'text-amber-400';
    return 'text-green-400';
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">에피소드 목록</h1>
            <span className="text-sm text-gray-500">{episodes.length}화</span>
          </div>

          <button
            onClick={handleCreateEpisode}
            disabled={creating}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              creating
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {creating ? '생성 중...' : '+ 새 에피소드'}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-5xl mx-auto px-6 py-2">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}

      {/* Episode List */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {episodes.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-xl font-semibold mb-2">아직 에피소드가 없습니다</h2>
            <p className="text-gray-400 mb-6">첫 번째 에피소드를 작성해보세요</p>
            <button
              onClick={handleCreateEpisode}
              disabled={creating}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
            >
              + 1화 시작하기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {episodes.map(episode => (
              <div
                key={episode.id}
                className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition cursor-pointer flex items-center justify-between"
                onClick={() => {
                  const nextPath = getEpisodeEditorPath(projectId, episode.id);
                  console.log('[EpisodesPage] navigate ->', nextPath);
                  router.push(nextPath);
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-700 rounded-lg flex items-center justify-center text-lg font-bold">
                    {episode.episode_number}
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {episode.title || `${episode.episode_number}화`}
                    </h3>
                    <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          STATUS_COLORS[episode.status]
                        }`}
                      >
                        {STATUS_LABELS[episode.status]}
                      </span>
                      <span className={getCharCountColor(episode.char_count)}>
                        {episode.char_count.toLocaleString()}자
                      </span>
                      {episode.status === 'published' && (
                        <span
                          className={`text-xs ${
                            episode.log_status === 'completed'
                              ? 'text-green-400'
                              : episode.log_status === 'failed'
                              ? 'text-red-400'
                              : 'text-yellow-400'
                          }`}
                        >
                          {LOG_STATUS_LABELS[episode.log_status]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {new Date(episode.updated_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(episode);
                    }}
                    className="text-gray-500 hover:text-red-400 transition px-2 py-1"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}

            {/* Add Next Episode Button */}
            <div className="pt-4">
              <button
                onClick={handleCreateEpisode}
                disabled={creating}
                className="w-full py-4 border-2 border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 transition"
              >
                + {episodes.length + 1}화 추가
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
