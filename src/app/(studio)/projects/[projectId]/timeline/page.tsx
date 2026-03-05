'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Episode {
  id: string;
  number: number;
  title: string | null;
  charCount: number;
  status: string;
  logStatus: string;
  createdAt: string;
  publishedAt: string | null;
}

interface EpisodeLog {
  episode_id: string;
  episode_number: number;
  summary: string;
  is_fallback: boolean;
}

interface Hook {
  id: string;
  hook_type: string;
  summary: string;
  status: string;
  importance: number;
  created_in_episode_number: number;
  resolved_in_episode_number: number | null;
  keywords: string[];
}

interface Character {
  id: string;
  name: string;
  role: string | null;
  first_appearance_episode: number | null;
  is_alive: boolean;
}

interface TimelineItem {
  episode: Episode;
  log: EpisodeLog | null;
  hooks: {
    created: Hook[];
    resolved: Hook[];
  };
  newCharacters: Character[];
}

interface Stats {
  totalEpisodes: number;
  publishedEpisodes: number;
  totalCharCount: number;
  openHooks: number;
  resolvedHooks: number;
  totalCharacters: number;
}

const HOOK_TYPE_LABELS: Record<string, string> = {
  foreshadowing: '복선',
  mystery: '미스터리',
  promise: '약속',
  setup: '설정',
  chekhov_gun: '체호프의 총',
};

const HOOK_TYPE_COLORS: Record<string, string> = {
  foreshadowing: 'bg-purple-600',
  mystery: 'bg-blue-600',
  promise: 'bg-green-600',
  setup: 'bg-yellow-600',
  chekhov_gun: 'bg-red-600',
};

const ROLE_LABELS: Record<string, string> = {
  protagonist: '주인공',
  antagonist: '적대자',
  supporting: '조연',
  extra: '엑스트라',
};

export default function TimelinePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [allHooks, setAllHooks] = useState<Hook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'hooks' | 'characters'>('timeline');

  const loadTimeline = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/timeline`);
      if (!res.ok) throw new Error('Failed to load timeline');

      const data = await res.json();
      setTimeline(data.timeline);
      setStats(data.stats);
      setAllHooks(data.hooks);
    } catch {
      setError('타임라인을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">타임라인 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-white overflow-y-auto">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">스토리 타임라인</h1>

          {/* View Mode Toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'timeline'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              타임라인
            </button>
            <button
              onClick={() => setViewMode('hooks')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'hooks'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              떡밥 추적
            </button>
            <button
              onClick={() => setViewMode('characters')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'characters'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              캐릭터
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto px-6 py-2">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}

      {/* Stats Bar */}
      {stats && (
        <div className="border-b border-gray-800 bg-gray-800/50">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-8 text-sm">
            <div>
              <span className="text-gray-400">총 에피소드:</span>{' '}
              <span className="font-semibold">{stats.totalEpisodes}화</span>
            </div>
            <div>
              <span className="text-gray-400">발행:</span>{' '}
              <span className="font-semibold text-green-400">{stats.publishedEpisodes}화</span>
            </div>
            <div>
              <span className="text-gray-400">총 글자수:</span>{' '}
              <span className="font-semibold">{stats.totalCharCount.toLocaleString()}자</span>
            </div>
            <div>
              <span className="text-gray-400">미해결 떡밥:</span>{' '}
              <span className="font-semibold text-amber-400">{stats.openHooks}개</span>
            </div>
            <div>
              <span className="text-gray-400">해결된 떡밥:</span>{' '}
              <span className="font-semibold text-green-400">{stats.resolvedHooks}개</span>
            </div>
            <div>
              <span className="text-gray-400">등장인물:</span>{' '}
              <span className="font-semibold">{stats.totalCharacters}명</span>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        {timeline.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📖</div>
            <h2 className="text-xl font-semibold mb-2">아직 에피소드가 없습니다</h2>
            <p className="text-gray-400 mb-6">에피소드를 작성하면 타임라인이 생성됩니다</p>
            <Link
              href={`/projects/${projectId}/episodes`}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition inline-block"
            >
              에피소드 작성하기
            </Link>
          </div>
        ) : viewMode === 'timeline' ? (
          <TimelineView
            timeline={timeline}
            selectedEpisode={selectedEpisode}
            onSelectEpisode={setSelectedEpisode}
            projectId={projectId}
          />
        ) : viewMode === 'hooks' ? (
          <HooksView hooks={allHooks} timeline={timeline} />
        ) : (
          <CharactersView timeline={timeline} />
        )}
      </div>
    </div>
  );
}

// 타임라인 뷰 컴포넌트
function TimelineView({
  timeline,
  selectedEpisode,
  onSelectEpisode,
  projectId,
}: {
  timeline: TimelineItem[];
  selectedEpisode: number | null;
  onSelectEpisode: (ep: number | null) => void;
  projectId: string;
}) {
  return (
    <div className="relative">
      {/* 세로 타임라인 선 */}
      <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-700" />

      <div className="space-y-6">
        {timeline.map((item, index) => (
          <div key={item.episode.id} className="relative pl-20">
            {/* 타임라인 노드 */}
            <div
              className={`absolute left-6 w-5 h-5 rounded-full border-2 cursor-pointer transition ${
                item.episode.status === 'published'
                  ? 'bg-green-600 border-green-400'
                  : item.episode.status === 'review'
                  ? 'bg-blue-600 border-blue-400'
                  : 'bg-gray-600 border-gray-400'
              } ${selectedEpisode === item.episode.number ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : ''}`}
              onClick={() => onSelectEpisode(
                selectedEpisode === item.episode.number ? null : item.episode.number
              )}
            />

            {/* 에피소드 카드 */}
            <div
              className={`bg-gray-800 rounded-lg p-4 transition ${
                selectedEpisode === item.episode.number ? 'ring-1 ring-blue-500' : ''
              }`}
            >
              {/* 헤더 */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <Link
                    href={`/projects/${projectId}/episodes/${item.episode.id}`}
                    className="font-semibold hover:text-blue-400 transition"
                  >
                    {item.episode.number}화: {item.episode.title || '제목 없음'}
                  </Link>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                    <span>{item.episode.charCount.toLocaleString()}자</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        item.episode.status === 'published'
                          ? 'bg-green-900 text-green-300'
                          : item.episode.status === 'review'
                          ? 'bg-blue-900 text-blue-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {item.episode.status === 'published' ? '발행됨' :
                       item.episode.status === 'review' ? '검토 중' : '초안'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(item.episode.createdAt).toLocaleDateString()}
                </div>
              </div>

              {/* 요약 */}
              {item.log && (
                <div className="text-sm text-gray-300 mb-3 line-clamp-2">
                  {item.log.summary}
                </div>
              )}

              {/* 이벤트들 */}
              <div className="flex flex-wrap gap-2">
                {/* 새 캐릭터 */}
                {item.newCharacters.map(char => (
                  <span
                    key={char.id}
                    className="px-2 py-1 bg-cyan-900/50 text-cyan-300 rounded text-xs"
                  >
                    + {char.name} ({ROLE_LABELS[char.role || ''] || char.role})
                  </span>
                ))}

                {/* 생성된 떡밥 */}
                {item.hooks.created.map(hook => (
                  <span
                    key={hook.id}
                    className={`px-2 py-1 rounded text-xs ${HOOK_TYPE_COLORS[hook.hook_type]} text-white`}
                    title={hook.summary}
                  >
                    + {HOOK_TYPE_LABELS[hook.hook_type] || hook.hook_type}
                  </span>
                ))}

                {/* 해결된 떡밥 */}
                {item.hooks.resolved.map(hook => (
                  <span
                    key={`resolved-${hook.id}`}
                    className="px-2 py-1 bg-green-900/50 text-green-300 rounded text-xs"
                    title={hook.summary}
                  >
                    ✓ {HOOK_TYPE_LABELS[hook.hook_type]} 해결
                  </span>
                ))}
              </div>

              {/* 확장 상세 */}
              {selectedEpisode === item.episode.number && item.log && (
                <div className="mt-4 pt-4 border-t border-gray-700">
                  <h4 className="text-sm font-medium text-gray-400 mb-2">에피소드 요약</h4>
                  <p className="text-sm text-gray-300">{item.log.summary}</p>

                  {item.hooks.created.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-400 mb-2">생성된 떡밥</h4>
                      <ul className="text-sm text-gray-300 space-y-1">
                        {item.hooks.created.map(hook => (
                          <li key={hook.id}>• {hook.summary}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 떡밥 추적 뷰
function HooksView({ hooks, timeline }: { hooks: Hook[]; timeline: TimelineItem[] }) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const filteredHooks = hooks.filter(hook => {
    if (filter === 'all') return true;
    if (filter === 'open') return hook.status === 'open';
    if (filter === 'resolved') return hook.status === 'resolved';
    return true;
  });

  return (
    <div>
      {/* 필터 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded text-sm ${
            filter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          전체 ({hooks.length})
        </button>
        <button
          onClick={() => setFilter('open')}
          className={`px-3 py-1.5 rounded text-sm ${
            filter === 'open' ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          미해결 ({hooks.filter(h => h.status === 'open').length})
        </button>
        <button
          onClick={() => setFilter('resolved')}
          className={`px-3 py-1.5 rounded text-sm ${
            filter === 'resolved' ? 'bg-green-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          해결됨 ({hooks.filter(h => h.status === 'resolved').length})
        </button>
      </div>

      {filteredHooks.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {filter === 'all' ? '아직 떡밥이 없습니다' : `${filter === 'open' ? '미해결' : '해결된'} 떡밥이 없습니다`}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHooks.map(hook => (
            <div
              key={hook.id}
              className="bg-gray-800 rounded-lg p-4 flex items-start gap-4"
            >
              <div
                className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${
                  hook.status === 'open' ? 'bg-amber-500' : 'bg-green-500'
                }`}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${HOOK_TYPE_COLORS[hook.hook_type]} text-white`}
                  >
                    {HOOK_TYPE_LABELS[hook.hook_type] || hook.hook_type}
                  </span>
                  <span className="text-xs text-gray-500">
                    중요도: {hook.importance}/10
                  </span>
                </div>
                <p className="text-gray-200">{hook.summary}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>생성: {hook.created_in_episode_number}화</span>
                  {hook.resolved_in_episode_number && (
                    <span className="text-green-400">
                      해결: {hook.resolved_in_episode_number}화
                    </span>
                  )}
                  {hook.status === 'open' && (
                    <span className="text-amber-400">
                      대기 중: {timeline.length - hook.created_in_episode_number + 1}화째
                    </span>
                  )}
                </div>
                {hook.keywords.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {hook.keywords.map((keyword, i) => (
                      <span
                        key={i}
                        className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400"
                      >
                        #{keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 캐릭터 뷰
function CharactersView({ timeline }: { timeline: TimelineItem[] }) {
  // 모든 캐릭터 수집
  const allCharacters = timeline.flatMap(t => t.newCharacters);

  if (allCharacters.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        아직 등록된 캐릭터가 없습니다
      </div>
    );
  }

  // 역할별 그룹화
  const byRole = allCharacters.reduce((acc, char) => {
    const role = char.role || 'extra';
    if (!acc[role]) acc[role] = [];
    acc[role].push(char);
    return acc;
  }, {} as Record<string, Character[]>);

  const roleOrder = ['protagonist', 'antagonist', 'supporting', 'extra'];

  return (
    <div className="space-y-8">
      {roleOrder.map(role => {
        const chars = byRole[role];
        if (!chars || chars.length === 0) return null;

        return (
          <div key={role}>
            <h3 className="text-lg font-semibold mb-4 text-gray-300">
              {ROLE_LABELS[role] || role} ({chars.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {chars.map(char => (
                <div
                  key={char.id}
                  className="bg-gray-800 rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                        role === 'protagonist'
                          ? 'bg-blue-600'
                          : role === 'antagonist'
                          ? 'bg-red-600'
                          : 'bg-gray-600'
                      }`}
                    >
                      {char.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {char.name}
                        {!char.is_alive && (
                          <span className="text-xs text-red-400">(사망)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">
                        첫 등장: {char.first_appearance_episode}화
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
