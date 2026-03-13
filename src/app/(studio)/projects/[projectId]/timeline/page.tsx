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

interface TimelineEvent {
  id: string;
  event_name: string;
  event_type: string;
  episode_start: number;
  episode_end: number;
  location: string | null;
  main_conflict: string | null;
  objectives: string[];
  constraints: string[];
  foreshadowing_seeds: string[];
  key_characters: string[];
  character_focus: string | null;
  tone: string | null;
  pacing: string | null;
  importance: number;
  status: string;
  notes: string | null;
  created_at: string;
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

const EVENT_TYPE_LABELS: Record<string, string> = {
  arc_start: '아크 시작',
  arc_climax: '클라이맥스',
  arc_end: '아크 종료',
  major_conflict: '주요 충돌',
  milestone: '마일스톤',
  turning_point: '전환점',
  setup: '설정 구간',
  cooldown: '휴식 구간',
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  arc_start: 'bg-blue-600',
  arc_climax: 'bg-red-600',
  arc_end: 'bg-indigo-600',
  major_conflict: 'bg-orange-600',
  milestone: 'bg-green-600',
  turning_point: 'bg-purple-600',
  setup: 'bg-yellow-600',
  cooldown: 'bg-gray-600',
};

const PACING_LABELS: Record<string, string> = {
  slow: '느린 전개',
  moderate: '보통 전개',
  fast: '빠른 전개',
  climactic: '최고조',
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
  const [viewMode, setViewMode] = useState<'timeline' | 'hooks' | 'characters' | 'macro' | 'synopsis'>('timeline');
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  // 전체 시놉시스 상태
  const [globalSynopsis, setGlobalSynopsis] = useState('');
  const [synopsisSaving, setSynopsisSaving] = useState(false);
  const [synopsisLoaded, setSynopsisLoaded] = useState(false);

  const loadTimeline = useCallback(async () => {
    try {
      setLoading(true);
      const [timelineRes, eventsRes, synopsisRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/timeline`),
        fetch(`/api/projects/${projectId}/timeline-events`),
        fetch(`/api/projects/${projectId}/story-bible`),
      ]);

      if (!timelineRes.ok) throw new Error('Failed to load timeline');

      const data = await timelineRes.json();
      setTimeline(data.timeline);
      setStats(data.stats);
      setAllHooks(data.hooks);

      if (eventsRes.ok) {
        const eventsData = await eventsRes.json();
        setTimelineEvents(eventsData.events || []);
      }

      // 전체 시놉시스 로드 (모든 에피소드 시놉시스 합침)
      if (synopsisRes.ok) {
        const synopsisData = await synopsisRes.json();
        const allSynopses = (synopsisData.synopses || [])
          .sort((a: { episode_number: number }, b: { episode_number: number }) => a.episode_number - b.episode_number)
          .map((s: { episode_number: number; synopsis: string }) => `[${s.episode_number}화]\n${s.synopsis}`)
          .join('\n\n---\n\n');
        setGlobalSynopsis(allSynopses);
        setSynopsisLoaded(true);
      }
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
            <button
              onClick={() => setViewMode('macro')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'macro'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              연표 관리
            </button>
            <button
              onClick={() => setViewMode('synopsis')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                viewMode === 'synopsis'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              📝 전체 시놉시스
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
        ) : viewMode === 'characters' ? (
          <CharactersView timeline={timeline} />
        ) : viewMode === 'synopsis' ? (
          <GlobalSynopsisView
            projectId={projectId}
            synopsis={globalSynopsis}
            setSynopsis={setGlobalSynopsis}
            saving={synopsisSaving}
            setSaving={setSynopsisSaving}
            onRefresh={loadTimeline}
          />
        ) : (
          <MacroTimelineView
            events={timelineEvents}
            projectId={projectId}
            onRefresh={loadTimeline}
            totalEpisodes={stats?.totalEpisodes || 0}
          />
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

// ★ 전체 시놉시스 읽기 전용 뷰 (V9.0.3 UI 통합)
// 시놉시스 편집은 스토리 바이블에서만 가능
function GlobalSynopsisView({
  projectId,
  synopsis,
}: {
  projectId: string;
  synopsis: string;
  setSynopsis?: (value: string) => void;
  saving?: boolean;
  setSaving?: (value: boolean) => void;
  onRefresh?: () => void;
}) {
  // synopsis를 파싱하여 에피소드별로 분리
  const parsedSynopses = synopsis
    .split(/---/)
    .map(b => b.trim())
    .filter(Boolean)
    .map(block => {
      const match = block.match(/^\[(\d+)화\]\s*([\s\S]*)/);
      if (match) {
        return {
          episodeNumber: parseInt(match[1]),
          content: match[2].trim(),
        };
      }
      return null;
    })
    .filter(Boolean) as { episodeNumber: number; content: string }[];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            📖 전체 시놉시스 (읽기 전용)
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            시놉시스 편집은 스토리 바이블에서 진행해주세요
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/story-bible`}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition flex items-center gap-2"
        >
          📚 스토리 바이블에서 편집 →
        </Link>
      </div>

      {/* 안내 박스 */}
      <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-300 mb-2">💡 시놉시스 Single Source of Truth</h3>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• <strong className="text-blue-300">스토리 바이블</strong>이 시놉시스의 유일한 편집 공간입니다</li>
          <li>• 이곳은 스토리 바이블 데이터를 읽기 전용으로 표시합니다</li>
          <li>• AI 에피소드 생성 시 스토리 바이블의 시놉시스가 자동으로 주입됩니다</li>
          <li>• 일괄 입력이 필요하면 스토리 바이블의 &quot;일괄 입력&quot; 기능을 사용하세요</li>
        </ul>
      </div>

      {/* 시놉시스 목록 (읽기 전용) */}
      {parsedSynopses.length > 0 ? (
        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {parsedSynopses.map((syn) => (
            <div
              key={syn.episodeNumber}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-purple-600/50 transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-purple-400 font-semibold">
                  [{syn.episodeNumber}화]
                </span>
                <Link
                  href={`/projects/${projectId}/story-bible`}
                  className="text-xs text-gray-500 hover:text-purple-400 transition"
                >
                  편집 →
                </Link>
              </div>
              <p className="text-sm text-gray-300 whitespace-pre-wrap line-clamp-4">
                {syn.content}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-800/30 border border-dashed border-gray-600 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-4">등록된 시놉시스가 없습니다</p>
          <Link
            href={`/projects/${projectId}/story-bible`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
          >
            📚 스토리 바이블에서 시놉시스 작성하기
          </Link>
        </div>
      )}

      {/* 요약 정보 */}
      {parsedSynopses.length > 0 && (
        <div className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            총 {parsedSynopses.length}개 에피소드 시놉시스 |
            {parsedSynopses.length > 0 && ` ${parsedSynopses[0].episodeNumber}화 ~ ${parsedSynopses[parsedSynopses.length - 1].episodeNumber}화`}
          </p>
          <Link
            href={`/projects/${projectId}/story-bible`}
            className="text-xs text-purple-400 hover:text-purple-300 transition"
          >
            전체 보기 및 편집 →
          </Link>
        </div>
      )}
    </div>
  );
}

// 연표 관리 뷰 (매크로 타임라인)
function MacroTimelineView({
  events,
  projectId,
  onRefresh,
  totalEpisodes,
}: {
  events: TimelineEvent[];
  projectId: string;
  onRefresh: () => void;
  totalEpisodes: number;
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TimelineEvent | null>(null);
  const [saving, setSaving] = useState(false);

  // 폼 상태
  const [formData, setFormData] = useState({
    event_name: '',
    event_type: 'major_conflict',
    episode_start: 1,
    episode_end: 1,
    location: '',
    main_conflict: '',
    objectives: [''],
    constraints: [''],
    foreshadowing_seeds: [''],
    character_focus: '',
    tone: '',
    pacing: 'moderate',
    importance: 5,
    notes: '',
  });

  const resetForm = () => {
    setFormData({
      event_name: '',
      event_type: 'major_conflict',
      episode_start: 1,
      episode_end: 1,
      location: '',
      main_conflict: '',
      objectives: [''],
      constraints: [''],
      foreshadowing_seeds: [''],
      character_focus: '',
      tone: '',
      pacing: 'moderate',
      importance: 5,
      notes: '',
    });
    setEditingEvent(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const openEditModal = (event: TimelineEvent) => {
    setEditingEvent(event);
    setFormData({
      event_name: event.event_name,
      event_type: event.event_type,
      episode_start: event.episode_start,
      episode_end: event.episode_end,
      location: event.location || '',
      main_conflict: event.main_conflict || '',
      objectives: event.objectives.length > 0 ? event.objectives : [''],
      constraints: event.constraints.length > 0 ? event.constraints : [''],
      foreshadowing_seeds: event.foreshadowing_seeds.length > 0 ? event.foreshadowing_seeds : [''],
      character_focus: event.character_focus || '',
      tone: event.tone || '',
      pacing: event.pacing || 'moderate',
      importance: event.importance,
      notes: event.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const payload = {
        ...formData,
        objectives: formData.objectives.filter(o => o.trim()),
        constraints: formData.constraints.filter(c => c.trim()),
        foreshadowing_seeds: formData.foreshadowing_seeds.filter(f => f.trim()),
      };

      const url = editingEvent
        ? `/api/projects/${projectId}/timeline-events/${editingEvent.id}`
        : `/api/projects/${projectId}/timeline-events`;

      const res = await fetch(url, {
        method: editingEvent ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save event');
      }

      setShowModal(false);
      resetForm();
      onRefresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm('이 이벤트를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/timeline-events/${eventId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete');
      onRefresh();
    } catch {
      alert('삭제 실패');
    }
  };

  const addArrayItem = (field: 'objectives' | 'constraints' | 'foreshadowing_seeds') => {
    setFormData(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const updateArrayItem = (field: 'objectives' | 'constraints' | 'foreshadowing_seeds', index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  const removeArrayItem = (field: 'objectives' | 'constraints' | 'foreshadowing_seeds', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  // 이벤트를 에피소드 범위별로 정렬
  const sortedEvents = [...events].sort((a, b) => a.episode_start - b.episode_start);

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">매크로 스토리 연표</h2>
          <p className="text-sm text-gray-400 mt-1">
            거시적 스토리 흐름을 계획하고 AI에게 방향을 지시합니다
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
        >
          + 이벤트 추가
        </button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-20 bg-gray-800/50 rounded-lg">
          <div className="text-5xl mb-4">📅</div>
          <h3 className="text-lg font-semibold mb-2">아직 연표가 없습니다</h3>
          <p className="text-gray-400 mb-6">
            스토리 아크, 주요 충돌, 마일스톤 등을 등록하세요
          </p>
          <button
            onClick={openCreateModal}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition"
          >
            첫 이벤트 만들기
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedEvents.map(event => (
            <div
              key={event.id}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-800/80 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`px-2 py-1 rounded text-xs text-white ${EVENT_TYPE_COLORS[event.event_type] || 'bg-gray-600'}`}
                    >
                      {EVENT_TYPE_LABELS[event.event_type] || event.event_type}
                    </span>
                    <span className="text-sm text-gray-400">
                      {event.episode_start}화 ~ {event.episode_end}화
                    </span>
                    <span className="text-xs text-gray-500">
                      중요도: {event.importance}/10
                    </span>
                    {event.pacing && (
                      <span className="text-xs text-gray-500">
                        {PACING_LABELS[event.pacing] || event.pacing}
                      </span>
                    )}
                  </div>

                  <h3 className="font-semibold text-lg mb-1">{event.event_name}</h3>

                  {event.main_conflict && (
                    <p className="text-gray-300 text-sm mb-2">{event.main_conflict}</p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-3">
                    {event.location && (
                      <span className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">
                        📍 {event.location}
                      </span>
                    )}
                    {event.objectives.length > 0 && (
                      <span className="px-2 py-1 bg-green-900/50 rounded text-xs text-green-300">
                        ✅ 목표 {event.objectives.length}개
                      </span>
                    )}
                    {event.constraints.length > 0 && (
                      <span className="px-2 py-1 bg-red-900/50 rounded text-xs text-red-300">
                        ❌ 제약 {event.constraints.length}개
                      </span>
                    )}
                    {event.foreshadowing_seeds.length > 0 && (
                      <span className="px-2 py-1 bg-purple-900/50 rounded text-xs text-purple-300">
                        💡 복선 {event.foreshadowing_seeds.length}개
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => openEditModal(event)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-sm transition"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 이벤트 추가/수정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {editingEvent ? '이벤트 수정' : '새 이벤트 추가'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    이벤트명 *
                  </label>
                  <input
                    type="text"
                    value={formData.event_name}
                    onChange={e => setFormData(prev => ({ ...prev, event_name: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="예: 충돌지대 - 첫 번째 관문"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    이벤트 타입 *
                  </label>
                  <select
                    value={formData.event_type}
                    onChange={e => setFormData(prev => ({ ...prev, event_type: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    페이싱
                  </label>
                  <select
                    value={formData.pacing}
                    onChange={e => setFormData(prev => ({ ...prev, pacing: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  >
                    {Object.entries(PACING_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    시작 에피소드 *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formData.episode_start}
                    onChange={e => setFormData(prev => ({ ...prev, episode_start: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    종료 에피소드 *
                  </label>
                  <input
                    type="number"
                    min={formData.episode_start}
                    value={formData.episode_end}
                    onChange={e => setFormData(prev => ({ ...prev, episode_end: parseInt(e.target.value) || 1 }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    주요 무대/지역
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="예: 흑풍산맥 입구"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    중요도 (1-10)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={formData.importance}
                    onChange={e => setFormData(prev => ({ ...prev, importance: parseInt(e.target.value) || 5 }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    분위기/톤
                  </label>
                  <input
                    type="text"
                    value={formData.tone}
                    onChange={e => setFormData(prev => ({ ...prev, tone: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                    placeholder="예: 긴장감 + 약간의 유머"
                  />
                </div>
              </div>

              {/* 핵심 갈등 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  핵심 갈등
                </label>
                <textarea
                  value={formData.main_conflict}
                  onChange={e => setFormData(prev => ({ ...prev, main_conflict: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                  placeholder="이 구간의 핵심 갈등/목표를 설명하세요"
                />
              </div>

              {/* 목표 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  달성해야 할 목표
                </label>
                {formData.objectives.map((obj, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={obj}
                      onChange={e => updateArrayItem('objectives', i, e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      placeholder={`목표 ${i + 1}`}
                    />
                    {formData.objectives.length > 1 && (
                      <button
                        onClick={() => removeArrayItem('objectives', i)}
                        className="px-3 py-2 bg-gray-700 hover:bg-red-900/50 rounded-lg text-gray-400 hover:text-red-300"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('objectives')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + 목표 추가
                </button>
              </div>

              {/* 제약 조건 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  제약 조건 (하면 안 되는 것)
                </label>
                {formData.constraints.map((con, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={con}
                      onChange={e => updateArrayItem('constraints', i, e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      placeholder={`제약 ${i + 1}`}
                    />
                    {formData.constraints.length > 1 && (
                      <button
                        onClick={() => removeArrayItem('constraints', i)}
                        className="px-3 py-2 bg-gray-700 hover:bg-red-900/50 rounded-lg text-gray-400 hover:text-red-300"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('constraints')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + 제약 추가
                </button>
              </div>

              {/* 복선 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  뿌려야 할 복선
                </label>
                {formData.foreshadowing_seeds.map((seed, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={seed}
                      onChange={e => updateArrayItem('foreshadowing_seeds', i, e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                      placeholder={`복선 ${i + 1}`}
                    />
                    {formData.foreshadowing_seeds.length > 1 && (
                      <button
                        onClick={() => removeArrayItem('foreshadowing_seeds', i)}
                        className="px-3 py-2 bg-gray-700 hover:bg-red-900/50 rounded-lg text-gray-400 hover:text-red-300"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addArrayItem('foreshadowing_seeds')}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  + 복선 추가
                </button>
              </div>

              {/* 메모 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  작가 메모
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none"
                  placeholder="추가 메모 (AI에게 전달되지 않음)"
                />
              </div>
            </div>

            {/* 버튼 */}
            <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.event_name}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
              >
                {saving ? '저장 중...' : editingEvent ? '수정' : '생성'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
