'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

interface EpisodeSynopsis {
  id: string;
  project_id: string;
  episode_number: number;
  title: string | null;
  synopsis: string;
  goals: string[] | null;
  key_events: string[] | null;
  featured_characters: string[] | null;
  location: string | null;
  time_context: string | null;
  arc_name: string | null;
  arc_position: string | null;
  foreshadowing: string[] | null;
  callbacks: string[] | null;
  notes: string | null;
  is_written: boolean;
  created_at: string;
  updated_at: string;
  // V9.0 신규 필드
  emotion_curve: string | null;
  ending_image: string | null;
  forbidden: string | null;
  scene_beats: string | null;
}

interface EditingState {
  episode_number: number;
  title: string;
  synopsis: string;
  goals: string;
  key_events: string;
  featured_characters: string;
  location: string;
  time_context: string;
  arc_name: string;
  arc_position: string;
  foreshadowing: string;
  callbacks: string;
  notes: string;
  // V9.0 신규 필드
  emotion_curve: string;
  ending_image: string;
  forbidden: string;
  scene_beats: string;
}

const ARC_POSITIONS = [
  { value: 'beginning', label: '시작 (도입)' },
  { value: 'rising', label: '상승 (전개)' },
  { value: 'middle', label: '중반 (위기)' },
  { value: 'climax', label: '클라이맥스' },
  { value: 'resolution', label: '해결' },
];

export default function StoryBiblePage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [synopses, setSynopses] = useState<EpisodeSynopsis[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 편집 모달
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState>({
    episode_number: 1,
    title: '',
    synopsis: '',
    goals: '',
    key_events: '',
    featured_characters: '',
    location: '',
    time_context: '',
    arc_name: '',
    arc_position: '',
    foreshadowing: '',
    callbacks: '',
    notes: '',
    // V9.0 신규 필드
    emotion_curve: '',
    ending_image: '',
    forbidden: '',
    scene_beats: '',
  });

  // 필터/뷰
  const [filterArc, setFilterArc] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');

  // 일괄 입력 모달
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const loadSynopses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/story-bible`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      setSynopses(data.synopses || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadSynopses();
  }, [loadSynopses]);

  // 새 시놉시스 모달 열기
  const handleNew = () => {
    const nextEpisode = synopses.length > 0
      ? Math.max(...synopses.map(s => s.episode_number)) + 1
      : 1;

    setEditingId(null);
    setEditing({
      episode_number: nextEpisode,
      title: '',
      synopsis: '',
      goals: '',
      key_events: '',
      featured_characters: '',
      location: '',
      time_context: '',
      arc_name: '',
      arc_position: '',
      foreshadowing: '',
      callbacks: '',
      notes: '',
      // V9.0 신규 필드
      emotion_curve: '',
      ending_image: '',
      forbidden: '',
      scene_beats: '',
    });
    setShowModal(true);
  };

  // 수정 모달 열기
  const handleEdit = (synopsis: EpisodeSynopsis) => {
    setEditingId(synopsis.id);
    setEditing({
      episode_number: synopsis.episode_number,
      title: synopsis.title || '',
      synopsis: synopsis.synopsis,
      goals: synopsis.goals?.join('\n') || '',
      key_events: synopsis.key_events?.join('\n') || '',
      featured_characters: synopsis.featured_characters?.join(', ') || '',
      location: synopsis.location || '',
      time_context: synopsis.time_context || '',
      arc_name: synopsis.arc_name || '',
      arc_position: synopsis.arc_position || '',
      foreshadowing: synopsis.foreshadowing?.join('\n') || '',
      callbacks: synopsis.callbacks?.join('\n') || '',
      notes: synopsis.notes || '',
      // V9.0 신규 필드
      emotion_curve: synopsis.emotion_curve || '',
      ending_image: synopsis.ending_image || '',
      forbidden: synopsis.forbidden || '',
      scene_beats: synopsis.scene_beats || '',
    });
    setShowModal(true);
  };

  // 저장
  const handleSave = async () => {
    if (!editing.synopsis.trim()) {
      setError('시놉시스를 입력해주세요.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        episode_number: editing.episode_number,
        title: editing.title || null,
        synopsis: editing.synopsis.trim(),
        goals: editing.goals.trim() ? editing.goals.split('\n').filter(g => g.trim()) : null,
        key_events: editing.key_events.trim() ? editing.key_events.split('\n').filter(e => e.trim()) : null,
        featured_characters: editing.featured_characters.trim()
          ? editing.featured_characters.split(',').map(c => c.trim()).filter(c => c)
          : null,
        location: editing.location || null,
        time_context: editing.time_context || null,
        arc_name: editing.arc_name || null,
        arc_position: editing.arc_position || null,
        foreshadowing: editing.foreshadowing.trim()
          ? editing.foreshadowing.split('\n').filter(f => f.trim())
          : null,
        callbacks: editing.callbacks.trim()
          ? editing.callbacks.split('\n').filter(c => c.trim())
          : null,
        notes: editing.notes || null,
        // V9.0 신규 필드
        emotion_curve: editing.emotion_curve || null,
        ending_image: editing.ending_image || null,
        forbidden: editing.forbidden || null,
        scene_beats: editing.scene_beats || null,
      };

      let res;
      if (editingId) {
        // 수정
        res = await fetch(`/api/projects/${projectId}/story-bible/${editing.episode_number}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // 신규 생성
        res = await fetch(`/api/projects/${projectId}/story-bible`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '저장 실패');
      }

      setShowModal(false);
      setSuccessMessage('저장되었습니다!');
      setTimeout(() => setSuccessMessage(null), 3000);
      loadSynopses();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  // 삭제
  const handleDelete = async (episodeNumber: number) => {
    if (!confirm(`${episodeNumber}화 시놉시스를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/story-bible/${episodeNumber}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('삭제 실패');

      setSuccessMessage('삭제되었습니다!');
      setTimeout(() => setSuccessMessage(null), 3000);
      loadSynopses();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  };

  // 일괄 입력 저장
  const handleBulkSave = async () => {
    if (!bulkText.trim()) {
      alert('시놉시스를 입력해주세요.');
      return;
    }

    setBulkSaving(true);
    try {
      // [N화] 형식으로 파싱
      const episodeSynopses: { episode_number: number; synopsis: string }[] = [];
      const blocks = bulkText.split(/---/).map(b => b.trim()).filter(Boolean);

      for (const block of blocks) {
        const match = block.match(/^\[(\d+)화\]\s*([\s\S]*)/);
        if (match) {
          const episodeNumber = parseInt(match[1]);
          const synopsisText = match[2].trim();
          if (synopsisText) {
            episodeSynopses.push({
              episode_number: episodeNumber,
              synopsis: synopsisText,
            });
          }
        }
      }

      if (episodeSynopses.length === 0) {
        alert('[N화] 형식으로 시놉시스를 구분해주세요.\n예: [1화]\\n시놉시스 내용\\n\\n---\\n\\n[2화]\\n시놉시스 내용');
        setBulkSaving(false);
        return;
      }

      // API 호출
      const res = await fetch(`/api/projects/${projectId}/story-bible`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ synopses: episodeSynopses }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '저장 실패');
      }

      setSuccessMessage(`${episodeSynopses.length}개 시놉시스 저장 완료!`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setShowBulkModal(false);
      setBulkText('');
      loadSynopses();
    } catch (error) {
      setError(error instanceof Error ? error.message : '저장 실패');
    } finally {
      setBulkSaving(false);
    }
  };

  // 일괄 입력 템플릿
  const insertBulkTemplate = (start: number, end: number) => {
    const template = Array.from({ length: end - start + 1 }, (_, i) => {
      const ep = start + i;
      return `[${ep}화]\n(${ep}화 시놉시스를 입력하세요)`;
    }).join('\n\n---\n\n');

    setBulkText(bulkText ? `${bulkText}\n\n---\n\n${template}` : template);
  };

  // 아크 목록 추출
  const arcs = Array.from(new Set(synopses.map(s => s.arc_name).filter(Boolean)));

  // 필터링
  const filteredSynopses = filterArc === 'all'
    ? synopses
    : synopses.filter(s => s.arc_name === filterArc);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            📚 스토리 바이블
            <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs font-normal">
              Single Source of Truth
            </span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            시놉시스의 유일한 편집 공간입니다. AI 에피소드 생성 시 여기서 작성한 시놉시스가 자동으로 주입됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
          >
            📝 일괄 입력
          </button>
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
          >
            + 시놉시스 추가
          </button>
        </div>
      </div>

      {/* 메시지 */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-300">
          {successMessage}
        </div>
      )}

      {/* 필터/뷰 토글 */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">아크:</span>
          <select
            value={filterArc}
            onChange={e => setFilterArc(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
          >
            <option value="all">전체</option>
            {arcs.map(arc => (
              <option key={arc} value={arc || ''}>{arc}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded text-sm transition ${
              viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            리스트
          </button>
          <button
            onClick={() => setViewMode('timeline')}
            className={`px-3 py-1 rounded text-sm transition ${
              viewMode === 'timeline' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            타임라인
          </button>
        </div>
        <div className="text-sm text-gray-500">
          총 {filteredSynopses.length}개 시놉시스
        </div>
      </div>

      {/* 시놉시스 목록 */}
      {filteredSynopses.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="mb-4">아직 등록된 시놉시스가 없습니다.</p>
          <button
            onClick={handleNew}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
          >
            첫 시놉시스 추가하기
          </button>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          {filteredSynopses.map(synopsis => (
            <div
              key={synopsis.id}
              className={`bg-gray-800/50 border rounded-lg p-4 transition hover:border-gray-600 ${
                synopsis.is_written ? 'border-green-700' : 'border-gray-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-lg font-bold text-blue-400">
                      {synopsis.episode_number}화
                    </span>
                    {synopsis.title && (
                      <span className="text-white">{synopsis.title}</span>
                    )}
                    {synopsis.arc_name && (
                      <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs">
                        {synopsis.arc_name}
                      </span>
                    )}
                    {synopsis.arc_position && (
                      <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-xs">
                        {ARC_POSITIONS.find(p => p.value === synopsis.arc_position)?.label || synopsis.arc_position}
                      </span>
                    )}
                    {synopsis.is_written && (
                      <span className="px-2 py-0.5 bg-green-900/50 text-green-300 rounded text-xs">
                        작성완료
                      </span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-3 whitespace-pre-wrap">
                    {synopsis.synopsis}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    {synopsis.location && (
                      <span>📍 {synopsis.location}</span>
                    )}
                    {synopsis.time_context && (
                      <span>🕐 {synopsis.time_context}</span>
                    )}
                    {synopsis.featured_characters && synopsis.featured_characters.length > 0 && (
                      <span>👥 {synopsis.featured_characters.join(', ')}</span>
                    )}
                    {synopsis.foreshadowing && synopsis.foreshadowing.length > 0 && (
                      <span>🎯 복선 {synopsis.foreshadowing.length}개</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => handleEdit(synopsis)}
                    className="px-2 py-1 text-sm text-gray-400 hover:text-white transition"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(synopsis.episode_number)}
                    className="px-2 py-1 text-sm text-red-400 hover:text-red-300 transition"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // 타임라인 뷰
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700" />
          <div className="space-y-6 pl-10">
            {filteredSynopses.map(synopsis => (
              <div key={synopsis.id} className="relative">
                <div className={`absolute -left-6 top-2 w-4 h-4 rounded-full border-2 ${
                  synopsis.is_written
                    ? 'bg-green-500 border-green-400'
                    : 'bg-gray-800 border-gray-500'
                }`} />
                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-bold text-blue-400">{synopsis.episode_number}화</span>
                    {synopsis.title && <span className="text-white">{synopsis.title}</span>}
                    {synopsis.arc_name && (
                      <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 rounded text-xs">
                        {synopsis.arc_name}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm">{synopsis.synopsis}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 편집 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-[800px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? `${editing.episode_number}화 시놉시스 수정` : '새 시놉시스'}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">에피소드 번호</label>
                <input
                  type="number"
                  min={1}
                  value={editing.episode_number}
                  onChange={e => setEditing(prev => ({ ...prev, episode_number: parseInt(e.target.value) || 1 }))}
                  disabled={!!editingId}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">제목 (선택)</label>
                <input
                  type="text"
                  value={editing.title}
                  onChange={e => setEditing(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="예: 입궁의 날"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">시놉시스 * <span className="text-yellow-500 text-xs">(씬 단위로 구체적으로!)</span></label>
              <textarea
                value={editing.synopsis}
                onChange={e => setEditing(prev => ({ ...prev, synopsis: e.target.value }))}
                placeholder={`씬 단위로 구체적으로 작성하세요. 예:
[씬1] 감옥 — 눈을 뜸. 목이 베인 공포의 잔상. 손이 떨림. 이 손이 자기 손이 아님을 깨닫고 비명을 삼킴.
[씬2] 기억 충돌 — 두통과 구역질. '나는 누구인가'라는 공포.
[씬3] 장로 심문 — 능구렁이식 대응. 장로의 표정이 미묘하게 변함.

※ 추상적 요약('감옥에서 깨어나 심문받음')은 금지. 감정과 행동을 구체적으로.`}
                rows={6}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">아크명</label>
                <input
                  type="text"
                  value={editing.arc_name}
                  onChange={e => setEditing(prev => ({ ...prev, arc_name: e.target.value }))}
                  placeholder="예: 입궁편, 복수편"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">아크 내 위치</label>
                <select
                  value={editing.arc_position}
                  onChange={e => setEditing(prev => ({ ...prev, arc_position: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                >
                  <option value="">선택...</option>
                  {ARC_POSITIONS.map(pos => (
                    <option key={pos.value} value={pos.value}>{pos.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">장소</label>
                <input
                  type="text"
                  value={editing.location}
                  onChange={e => setEditing(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="예: 황궁 내전"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">시간 배경</label>
                <input
                  type="text"
                  value={editing.time_context}
                  onChange={e => setEditing(prev => ({ ...prev, time_context: e.target.value }))}
                  placeholder="예: 입궁 3일차 오후"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">주요 등장인물 (쉼표로 구분)</label>
              <input
                type="text"
                value={editing.featured_characters}
                onChange={e => setEditing(prev => ({ ...prev, featured_characters: e.target.value }))}
                placeholder="예: 주인공, 황제, 내시"
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">목표 (줄바꿈으로 구분)</label>
                <textarea
                  value={editing.goals}
                  onChange={e => setEditing(prev => ({ ...prev, goals: e.target.value }))}
                  placeholder="이 에피소드에서 달성할 목표들..."
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">핵심 사건 (줄바꿈으로 구분)</label>
                <textarea
                  value={editing.key_events}
                  onChange={e => setEditing(prev => ({ ...prev, key_events: e.target.value }))}
                  placeholder="주요 사건들..."
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">깔아야 할 복선 (줄바꿈으로 구분)</label>
                <textarea
                  value={editing.foreshadowing}
                  onChange={e => setEditing(prev => ({ ...prev, foreshadowing: e.target.value }))}
                  placeholder="이 에피소드에서 깔 복선..."
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">회수할 복선 (줄바꿈으로 구분)</label>
                <textarea
                  value={editing.callbacks}
                  onChange={e => setEditing(prev => ({ ...prev, callbacks: e.target.value }))}
                  placeholder="이전 복선 중 회수할 것..."
                  rows={3}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none text-sm"
                />
              </div>
            </div>

            {/* V9.0 신규 필드 */}
            <div className="mb-4 p-4 bg-purple-900/20 border border-purple-700 rounded-lg">
              <h4 className="text-sm font-semibold text-purple-400 mb-3">V9.0 연출 대본 <span className="text-gray-500 font-normal">(구체적일수록 AI 출력 품질 ↑)</span></h4>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">감정 곡선</label>
                  <input
                    type="text"
                    value={editing.emotion_curve}
                    onChange={e => setEditing(prev => ({ ...prev, emotion_curve: e.target.value }))}
                    placeholder="공포→혼란→분노(삼키며)→냉정한 관찰→위기감"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">마지막 장면 이미지 <span className="text-yellow-500">★</span></label>
                  <input
                    type="text"
                    value={editing.ending_image}
                    onChange={e => setEditing(prev => ({ ...prev, ending_image: e.target.value }))}
                    placeholder="장로의 손가락이 고문 도구를 만지며 미소, 쇠사슬이 '찰깍' 풀린다"
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-sm text-gray-400 mb-1">이번 화 금지사항</label>
                <input
                  type="text"
                  value={editing.forbidden}
                  onChange={e => setEditing(prev => ({ ...prev, forbidden: e.target.value }))}
                  placeholder="정체 노출 금지, '제3의 길' 같은 거대 선언 금지, 직접적 과거 설명 금지"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">씬 대본 (선택) <span className="text-gray-500">— 갈등/감정/행동 명시</span></label>
                <textarea
                  value={editing.scene_beats}
                  onChange={e => setEditing(prev => ({ ...prev, scene_beats: e.target.value }))}
                  placeholder={`씬1: 공포→혼란 / 손으로 얼굴을 만지며 낯선 몸 확인
씬2: 혼란→분노 / 기억이 충돌하며 두통, 벽을 주먹으로 침
씬3: 경계→도발 / 장로에게 능청스럽게 대응하다가 약점 포착`}
                  rows={4}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none text-sm"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-400 mb-1">PD 메모</label>
              <textarea
                value={editing.notes}
                onChange={e => setEditing(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="추가 메모..."
                rows={2}
                className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 resize-none text-sm"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="px-4 py-2 text-gray-400 hover:text-white transition"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editing.synopsis.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  saving || !editing.synopsis.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 입력 모달 */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  📝 시놉시스 일괄 입력
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  여러 에피소드의 시놉시스를 한 번에 입력합니다
                </p>
              </div>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 안내 박스 */}
              <div className="bg-purple-900/20 border border-purple-700/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-300 mb-2">💡 사용 방법</h3>
                <ul className="text-xs text-gray-400 space-y-1">
                  <li>• <code className="bg-gray-800 px-1 rounded">[N화]</code> 형식으로 각 에피소드 시놉시스를 시작합니다</li>
                  <li>• 에피소드 사이는 <code className="bg-gray-800 px-1 rounded">---</code> 구분선으로 나눕니다</li>
                  <li>• 기존 시놉시스가 있으면 덮어씁니다 (Upsert)</li>
                </ul>
              </div>

              {/* 빠른 템플릿 버튼 */}
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-gray-400 py-1">템플릿 삽입:</span>
                {[[1, 10], [11, 20], [21, 30], [1, 50], [1, 100]].map(([start, end]) => (
                  <button
                    key={`${start}-${end}`}
                    onClick={() => insertBulkTemplate(start, end)}
                    className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-xs transition"
                  >
                    {start}~{end}화
                  </button>
                ))}
              </div>

              {/* 메인 텍스트 입력 */}
              <div className="relative">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`[1화]
[씬1] 형장 — 새벽 안개 속 처형대. 주인공은 목이 잘리기 직전 눈을 뜬다.
[씬2] 감옥 — 낯선 몸, 낯선 기억. 누군가의 몸에 빙의했음을 깨달음.
[씬3] 심문 — 장로가 찾아와 의미심장한 질문. 주인공은 능청스럽게 응수.
목표: 주인공 첫인상 각인, 빙의 세계관 도입

---

[2화]
[씬1] 감옥 탈출 시도 — 쇠창살 너머로 탈출로 탐색.
...`}
                  className="w-full h-[400px] bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none font-mono text-sm leading-relaxed"
                />
                <div className="absolute bottom-3 right-3 text-xs text-gray-500 bg-gray-800/80 px-2 py-1 rounded">
                  {bulkText.length.toLocaleString()}자
                </div>
              </div>

              {/* 파싱 프리뷰 */}
              {bulkText && (
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3">📋 파싱 프리뷰</h3>
                  <div className="flex flex-wrap gap-2">
                    {bulkText.split(/---/).map(b => b.trim()).filter(Boolean).map((block, i) => {
                      const match = block.match(/^\[(\d+)화\]/);
                      if (match) {
                        return (
                          <span
                            key={i}
                            className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-xs"
                          >
                            {match[1]}화
                          </span>
                        );
                      }
                      return null;
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    감지된 에피소드: {bulkText.split(/---/).filter(b => /^\[(\d+)화\]/.test(b.trim())).length}개
                  </p>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkText('');
                  }}
                  disabled={bulkSaving}
                  className="px-4 py-2 text-gray-400 hover:text-white transition"
                >
                  취소
                </button>
                <button
                  onClick={handleBulkSave}
                  disabled={bulkSaving || !bulkText.trim()}
                  className={`px-6 py-2 rounded-lg font-medium transition ${
                    bulkSaving || !bulkText.trim()
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  {bulkSaving ? '저장 중...' : '💾 일괄 저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
