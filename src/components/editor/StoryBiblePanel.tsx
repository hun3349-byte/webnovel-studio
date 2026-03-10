'use client';

import { useState, useEffect, useCallback } from 'react';

interface EpisodeSynopsis {
  id?: string;
  episode_number: number;
  title?: string | null;
  synopsis: string;
  goals?: string[] | null;
  key_events?: string[] | null;
  featured_characters?: string[] | null;
  location?: string | null;
  time_context?: string | null;
  arc_name?: string | null;
  arc_position?: string | null;
  foreshadowing?: string[] | null;
  callbacks?: string[] | null;
  notes?: string | null;
  is_written?: boolean;
}

interface TimelineEvent {
  id: string;
  event_type: 'arc' | 'conflict' | 'milestone' | 'climax' | 'twist';
  title: string;
  description?: string;
  start_episode?: number;
  end_episode?: number;
}

interface StoryBiblePanelProps {
  projectId: string;
  targetEpisodeNumber: number;
  onSynopsisChange?: (synopsis: string) => void;
}

/**
 * 스토리 바이블 입력 패널
 * - v8.4 Dynamic Context와 연동
 * - 현재 에피소드의 시놉시스 입력/편집
 * - 타임라인 이벤트 표시
 * - 실시간 저장
 */
export function StoryBiblePanel({
  projectId,
  targetEpisodeNumber,
  onSynopsisChange,
}: StoryBiblePanelProps) {
  const [synopsis, setSynopsis] = useState<EpisodeSynopsis | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'synopsis' | 'timeline' | 'context'>('synopsis');
  const [hasChanges, setHasChanges] = useState(false);

  // 폼 상태
  const [form, setForm] = useState({
    synopsis: '',
    goals: '',
    keyEvents: '',
    location: '',
    timeContext: '',
    notes: '',
  });

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 시놉시스 로드
      const synopsisRes = await fetch(`/api/projects/${projectId}/story-bible`);
      if (synopsisRes.ok) {
        const data = await synopsisRes.json();
        const current = data.synopses?.find(
          (s: EpisodeSynopsis) => s.episode_number === targetEpisodeNumber
        );
        if (current) {
          setSynopsis(current);
          setForm({
            synopsis: current.synopsis || '',
            goals: current.goals?.join('\n') || '',
            keyEvents: current.key_events?.join('\n') || '',
            location: current.location || '',
            timeContext: current.time_context || '',
            notes: current.notes || '',
          });
        }
      }

      // 타임라인 이벤트 로드
      const timelineRes = await fetch(`/api/projects/${projectId}/timeline-events`);
      if (timelineRes.ok) {
        const data = await timelineRes.json();
        // 현재 에피소드 범위에 해당하는 이벤트만 필터링
        const relevantEvents = (data.events || []).filter((event: TimelineEvent) => {
          if (!event.start_episode) return false;
          if (event.end_episode) {
            return targetEpisodeNumber >= event.start_episode && targetEpisodeNumber <= event.end_episode;
          }
          return targetEpisodeNumber >= event.start_episode;
        });
        setTimelineEvents(relevantEvents);
      }
    } catch (error) {
      console.error('Failed to load story bible data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId, targetEpisodeNumber]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 폼 변경 시 변경 감지
  const handleFormChange = (field: keyof typeof form, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    if (field === 'synopsis') {
      onSynopsisChange?.(value);
    }
  };

  // 시놉시스 저장
  const handleSave = async () => {
    if (!form.synopsis.trim()) {
      alert('시놉시스를 입력해주세요.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        episode_number: targetEpisodeNumber,
        synopsis: form.synopsis.trim(),
        goals: form.goals.split('\n').map(s => s.trim()).filter(Boolean),
        key_events: form.keyEvents.split('\n').map(s => s.trim()).filter(Boolean),
        location: form.location.trim() || null,
        time_context: form.timeContext.trim() || null,
        notes: form.notes.trim() || null,
      };

      const method = synopsis?.id ? 'PUT' : 'POST';
      const body = synopsis?.id
        ? { synopses: [payload] }
        : payload;

      const res = await fetch(`/api/projects/${projectId}/story-bible`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setHasChanges(false);
        const data = await res.json();
        if (data.synopsis) {
          setSynopsis(data.synopsis);
        } else if (data.synopses?.[0]) {
          setSynopsis(data.synopses[0]);
        }
      } else {
        const error = await res.json();
        alert(error.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save synopsis:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // 이벤트 타입별 색상
  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'arc':
        return 'border-blue-500 bg-blue-500/10';
      case 'conflict':
        return 'border-orange-500 bg-orange-500/10';
      case 'climax':
        return 'border-red-500 bg-red-500/10';
      case 'twist':
        return 'border-purple-500 bg-purple-500/10';
      case 'milestone':
        return 'border-green-500 bg-green-500/10';
      default:
        return 'border-gray-500 bg-gray-500/10';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-gray-400 text-sm">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 탭 헤더 */}
      <div className="flex border-b border-gray-700 mb-3">
        <button
          onClick={() => setActiveTab('synopsis')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            activeTab === 'synopsis'
              ? 'text-white border-b-2 border-blue-500 -mb-px'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          시놉시스
        </button>
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            activeTab === 'timeline'
              ? 'text-white border-b-2 border-blue-500 -mb-px'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          타임라인 ({timelineEvents.length})
        </button>
        <button
          onClick={() => setActiveTab('context')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition ${
            activeTab === 'context'
              ? 'text-white border-b-2 border-blue-500 -mb-px'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          컨텍스트
        </button>
      </div>

      {/* 시놉시스 탭 */}
      {activeTab === 'synopsis' && (
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* 메인 시놉시스 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {targetEpisodeNumber}화 시놉시스 *
            </label>
            <textarea
              value={form.synopsis}
              onChange={(e) => handleFormChange('synopsis', e.target.value)}
              placeholder="이번 화의 핵심 줄거리를 입력하세요..."
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 목표 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              이번 화 목표 (줄바꿈으로 구분)
            </label>
            <textarea
              value={form.goals}
              onChange={(e) => handleFormChange('goals', e.target.value)}
              placeholder="- 주인공의 결의 표현&#10;- 첫 번째 적과의 조우"
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 주요 이벤트 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              주요 이벤트 (줄바꿈으로 구분)
            </label>
            <textarea
              value={form.keyEvents}
              onChange={(e) => handleFormChange('keyEvents', e.target.value)}
              placeholder="- 암습 발생&#10;- 비밀 편지 발견"
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 장소/시간 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">장소</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => handleFormChange('location', e.target.value)}
                placeholder="예: 황궁, 무림맹"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">시간대</label>
              <input
                type="text"
                value={form.timeContext}
                onChange={(e) => handleFormChange('timeContext', e.target.value)}
                placeholder="예: 새벽, 한달 후"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">작가 메모</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleFormChange('notes', e.target.value)}
              placeholder="이번 화에서 주의할 점, 복선 힌트 등..."
              rows={2}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`w-full py-2 rounded-lg text-sm font-medium transition ${
              saving || !hasChanges
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {saving ? '저장 중...' : hasChanges ? '시놉시스 저장' : '저장됨'}
          </button>

          {synopsis?.id && (
            <p className="text-xs text-gray-500 text-center">
              마지막 수정: {new Date(synopsis.id).toLocaleDateString('ko-KR')}
            </p>
          )}
        </div>
      )}

      {/* 타임라인 탭 */}
      {activeTab === 'timeline' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          {timelineEvents.length > 0 ? (
            timelineEvents.map((event) => (
              <div
                key={event.id}
                className={`rounded-lg border-l-4 p-3 ${getEventTypeColor(event.event_type)}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs uppercase text-gray-400 font-medium">
                    {event.event_type}
                  </span>
                  <span className="text-xs text-gray-500">
                    {event.start_episode}화{event.end_episode ? ` ~ ${event.end_episode}화` : ''}
                  </span>
                </div>
                <h4 className="text-sm font-medium text-white">{event.title}</h4>
                {event.description && (
                  <p className="text-xs text-gray-400 mt-1">{event.description}</p>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              <p>현재 에피소드 범위에 해당하는</p>
              <p>타임라인 이벤트가 없습니다.</p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-700">
            <a
              href={`/projects/${projectId}/timeline`}
              className="block text-center text-xs text-blue-400 hover:text-blue-300 transition"
            >
              타임라인 관리 페이지로 이동 →
            </a>
          </div>
        </div>
      )}

      {/* 컨텍스트 탭 - Dynamic Context 미리보기 */}
      {activeTab === 'context' && (
        <div className="flex-1 overflow-y-auto space-y-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-cyan-400 mb-2">Dynamic Context 구성</h4>
            <ul className="space-y-1 text-xs text-gray-400">
              <li className="flex items-center gap-2">
                <span className={form.synopsis ? 'text-green-400' : 'text-gray-600'}>
                  {form.synopsis ? '✓' : '○'}
                </span>
                시놉시스 ({form.synopsis.length}자)
              </li>
              <li className="flex items-center gap-2">
                <span className={timelineEvents.length > 0 ? 'text-green-400' : 'text-gray-600'}>
                  {timelineEvents.length > 0 ? '✓' : '○'}
                </span>
                타임라인 이벤트 ({timelineEvents.length}개)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-600">○</span>
                이전 에피소드 엔딩 (자동 로드)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-gray-600">○</span>
                캐릭터 상태 (자동 로드)
              </li>
            </ul>
          </div>

          <div className="bg-gray-800/50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-purple-400 mb-2">토큰 최적화</h4>
            <p className="text-xs text-gray-400">
              Dynamic Context 시스템은 필수 정보만 추출하여 토큰 사용량을 최적화합니다.
              시놉시스를 입력하면 AI가 더 정확한 스토리를 생성합니다.
            </p>
          </div>

          <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-amber-400 mb-1">팁</h4>
            <p className="text-xs text-gray-400">
              시놉시스에 이번 화의 핵심 갈등과 목표를 명시하면 AI가 더 일관된 스토리를 생성합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default StoryBiblePanel;
