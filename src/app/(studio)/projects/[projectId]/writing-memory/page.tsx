'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface WritingMemory {
  id: string;
  project_id: string;
  feedback_type: string;
  original_text: string | null;
  edited_text: string | null;
  preference_summary: string | null;
  avoid_patterns: string[];
  favor_patterns: string[];
  confidence: number;
  applied_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total: number;
  active: number;
  byType: Record<string, number>;
  avgConfidence: string | number;
}

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  style: '문체',
  vocabulary: '어휘',
  pacing: '호흡',
  dialogue: '대사',
  description: '묘사',
  structure: '구조',
};

const FEEDBACK_TYPE_COLORS: Record<string, string> = {
  style: 'bg-purple-600',
  vocabulary: 'bg-blue-600',
  pacing: 'bg-green-600',
  dialogue: 'bg-yellow-600',
  description: 'bg-pink-600',
  structure: 'bg-cyan-600',
};

const FEEDBACK_TYPE_ICONS: Record<string, string> = {
  style: '✍️',
  vocabulary: '📚',
  pacing: '🎵',
  dialogue: '💬',
  description: '🎨',
  structure: '🏗️',
};

export default function WritingMemoryPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [memories, setMemories] = useState<WritingMemory[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/writing-memories`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      setMemories(data.memories);
      setStats(data.stats);
    } catch {
      setError('Writing Memory를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const handleToggleActive = async (memory: WritingMemory) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/writing-memories/${memory.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !memory.is_active }),
        }
      );

      if (!res.ok) throw new Error('Failed to update');
      loadMemories();
    } catch {
      alert('업데이트에 실패했습니다.');
    }
  };

  const handleDelete = async (memory: WritingMemory) => {
    if (!confirm('이 학습 데이터를 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/writing-memories/${memory.id}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Failed to delete');
      loadMemories();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const filteredMemories = selectedType
    ? memories.filter(m => m.feedback_type === selectedType)
    : memories;

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
            <h1 className="text-xl font-bold">Writing Memory</h1>
            <span className="text-sm text-gray-500">자가진화 피드백 시스템</span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowAnalyzeModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
            >
              AI 분석
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              + 수동 추가
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto px-6 py-2">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">총 학습 데이터</div>
              <div className="text-2xl font-bold">{stats.total}개</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">활성화됨</div>
              <div className="text-2xl font-bold text-green-400">{stats.active}개</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">평균 신뢰도</div>
              <div className="text-2xl font-bold text-blue-400">
                {(Number(stats.avgConfidence) * 100).toFixed(0)}%
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">카테고리</div>
              <div className="text-2xl font-bold">
                {Object.keys(stats.byType).length}종류
              </div>
            </div>
          </div>
        )}

        {/* Type Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setSelectedType(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              selectedType === null
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            전체 ({memories.length})
          </button>
          {Object.entries(FEEDBACK_TYPE_LABELS).map(([type, label]) => {
            const count = memories.filter(m => m.feedback_type === type).length;
            if (count === 0) return null;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(selectedType === type ? null : type)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                  selectedType === type
                    ? `${FEEDBACK_TYPE_COLORS[type]} text-white`
                    : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                <span>{FEEDBACK_TYPE_ICONS[type]}</span>
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* Memory List */}
        {filteredMemories.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🧠</div>
            <h2 className="text-xl font-semibold mb-2">학습된 데이터가 없습니다</h2>
            <p className="text-gray-400 mb-6">
              에피소드를 수정하면 AI가 당신의 문체를 학습합니다
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowAnalyzeModal(true)}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition"
              >
                텍스트 비교로 학습하기
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition"
              >
                수동으로 규칙 추가
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMemories.map(memory => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                onToggleActive={() => handleToggleActive(memory)}
                onDelete={() => handleDelete(memory)}
              />
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-12 p-6 bg-gray-800/50 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span>💡</span> Writing Memory 작동 방식
          </h3>
          <div className="text-sm text-gray-400 space-y-2">
            <p>
              <strong className="text-gray-300">1. 자동 학습:</strong>{' '}
              에피소드를 수정하면 AI가 원본과 수정본을 비교하여 패턴을 추출합니다.
            </p>
            <p>
              <strong className="text-gray-300">2. 프롬프트 주입:</strong>{' '}
              활성화된 학습 데이터는 AI 생성 시 자동으로 프롬프트에 포함됩니다.
            </p>
            <p>
              <strong className="text-gray-300">3. 신뢰도 시스템:</strong>{' '}
              반복적으로 적용된 패턴은 신뢰도가 상승하여 우선순위가 높아집니다.
            </p>
            <p>
              <strong className="text-gray-300">4. 최우선 규칙:</strong>{' '}
              PD의 수정 패턴은 기본 상업 웹소설 규칙보다 우선 적용됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <AddMemoryModal
          projectId={projectId}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            loadMemories();
          }}
        />
      )}

      {/* Analyze Modal */}
      {showAnalyzeModal && (
        <AnalyzeModal
          projectId={projectId}
          onClose={() => setShowAnalyzeModal(false)}
          onSuccess={() => {
            setShowAnalyzeModal(false);
            loadMemories();
          }}
        />
      )}
    </div>
  );
}

// 메모리 카드 컴포넌트
function MemoryCard({
  memory,
  onToggleActive,
  onDelete,
}: {
  memory: WritingMemory;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-gray-800 rounded-lg p-4 border transition ${
        memory.is_active ? 'border-gray-700' : 'border-gray-800 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              FEEDBACK_TYPE_COLORS[memory.feedback_type]
            }`}
          >
            {FEEDBACK_TYPE_ICONS[memory.feedback_type]}{' '}
            {FEEDBACK_TYPE_LABELS[memory.feedback_type] || memory.feedback_type}
          </span>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>신뢰도: {(memory.confidence * 100).toFixed(0)}%</span>
            <span>|</span>
            <span>적용: {memory.applied_count}회</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleActive}
            className={`px-2 py-1 rounded text-xs transition ${
              memory.is_active
                ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {memory.is_active ? '활성' : '비활성'}
          </button>
          <button
            onClick={onDelete}
            className="text-gray-500 hover:text-red-400 transition text-xs px-2 py-1"
          >
            삭제
          </button>
        </div>
      </div>

      {/* Summary */}
      {memory.preference_summary && (
        <p className="text-gray-300 mb-3">{memory.preference_summary}</p>
      )}

      {/* Patterns */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Avoid Patterns */}
        {memory.avoid_patterns.length > 0 && (
          <div className="bg-red-900/20 rounded-lg p-3">
            <h4 className="text-xs font-medium text-red-400 mb-2">피해야 할 패턴</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              {memory.avoid_patterns.slice(0, expanded ? undefined : 2).map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-red-400">✕</span>
                  <span>{p}</span>
                </li>
              ))}
              {!expanded && memory.avoid_patterns.length > 2 && (
                <li className="text-gray-500 text-xs">
                  +{memory.avoid_patterns.length - 2}개 더...
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Favor Patterns */}
        {memory.favor_patterns.length > 0 && (
          <div className="bg-green-900/20 rounded-lg p-3">
            <h4 className="text-xs font-medium text-green-400 mb-2">선호하는 패턴</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              {memory.favor_patterns.slice(0, expanded ? undefined : 2).map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-green-400">✓</span>
                  <span>{p}</span>
                </li>
              ))}
              {!expanded && memory.favor_patterns.length > 2 && (
                <li className="text-gray-500 text-xs">
                  +{memory.favor_patterns.length - 2}개 더...
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Expand Toggle */}
      {(memory.avoid_patterns.length > 2 || memory.favor_patterns.length > 2 || memory.original_text) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-gray-500 hover:text-gray-400 transition"
        >
          {expanded ? '접기' : '더 보기'}
        </button>
      )}

      {/* Original/Edited Text (expanded) */}
      {expanded && memory.original_text && memory.edited_text && (
        <div className="mt-4 pt-4 border-t border-gray-700 grid md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">원본</h4>
            <p className="text-sm text-gray-400 bg-gray-900/50 rounded p-2">
              {memory.original_text}
            </p>
          </div>
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">수정본</h4>
            <p className="text-sm text-gray-300 bg-gray-900/50 rounded p-2">
              {memory.edited_text}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// 수동 추가 모달
function AddMemoryModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [feedbackType, setFeedbackType] = useState('style');
  const [summary, setSummary] = useState('');
  const [avoidPatterns, setAvoidPatterns] = useState('');
  const [favorPatterns, setFavorPatterns] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      alert('요약을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);
      const res = await fetch(`/api/projects/${projectId}/writing-memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback_type: feedbackType,
          preference_summary: summary,
          avoid_patterns: avoidPatterns.split('\n').filter(p => p.trim()),
          favor_patterns: favorPatterns.split('\n').filter(p => p.trim()),
          confidence: 0.8,
        }),
      });

      if (!res.ok) throw new Error('Failed to create');
      onSuccess();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">수동으로 규칙 추가</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">카테고리</label>
              <select
                value={feedbackType}
                onChange={e => setFeedbackType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
              >
                {Object.entries(FEEDBACK_TYPE_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>
                    {FEEDBACK_TYPE_ICONS[type]} {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">요약</label>
              <input
                type="text"
                value={summary}
                onChange={e => setSummary(e.target.value)}
                placeholder="예: 짧은 문장 위주의 긴장감 있는 전개 선호"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                피해야 할 패턴 (줄바꿈으로 구분)
              </label>
              <textarea
                value={avoidPatterns}
                onChange={e => setAvoidPatterns(e.target.value)}
                placeholder="감정 직접 서술&#10;지나치게 긴 문장"
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                선호하는 패턴 (줄바꿈으로 구분)
              </label>
              <textarea
                value={favorPatterns}
                onChange={e => setFavorPatterns(e.target.value)}
                placeholder="신체 반응으로 감정 표현&#10;짧은 문장 연속 사용"
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// AI 분석 모달
function AnalyzeModal({
  projectId,
  onClose,
  onSuccess,
}: {
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [originalText, setOriginalText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<{
    feedback_type: string;
    preference_summary: string;
    avoid_patterns: string[];
    favor_patterns: string[];
    confidence: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleAnalyze = async () => {
    if (!originalText.trim() || !editedText.trim()) {
      alert('원본과 수정본을 모두 입력해주세요.');
      return;
    }

    try {
      setAnalyzing(true);
      const res = await fetch('/api/ai/analyze-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalText, editedText, useMock: true }),
      });

      if (!res.ok) throw new Error('Analysis failed');

      const data = await res.json();
      setAnalysis(data.analysis);
    } catch {
      alert('분석에 실패했습니다.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!analysis) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/projects/${projectId}/writing-memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback_type: analysis.feedback_type,
          original_text: originalText,
          edited_text: editedText,
          preference_summary: analysis.preference_summary,
          avoid_patterns: analysis.avoid_patterns,
          favor_patterns: analysis.favor_patterns,
          confidence: analysis.confidence,
        }),
      });

      if (!res.ok) throw new Error('Failed to save');
      onSuccess();
    } catch {
      alert('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">AI 텍스트 비교 분석</h2>
          <p className="text-gray-400 text-sm mb-6">
            원본 텍스트와 수정된 텍스트를 비교하여 문체 패턴을 자동으로 추출합니다.
          </p>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm text-gray-400 mb-2">원본 (AI 생성)</label>
              <textarea
                value={originalText}
                onChange={e => setOriginalText(e.target.value)}
                placeholder="AI가 생성한 원본 텍스트를 붙여넣으세요..."
                rows={8}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">수정본 (PD 편집)</label>
              <textarea
                value={editedText}
                onChange={e => setEditedText(e.target.value)}
                placeholder="PD가 수정한 텍스트를 붙여넣으세요..."
                rows={8}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500"
              />
            </div>
          </div>

          {!analysis ? (
            <div className="flex justify-center">
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition disabled:opacity-50"
              >
                {analyzing ? '분석 중...' : 'AI 분석 시작'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      FEEDBACK_TYPE_COLORS[analysis.feedback_type]
                    }`}
                  >
                    {FEEDBACK_TYPE_ICONS[analysis.feedback_type]}{' '}
                    {FEEDBACK_TYPE_LABELS[analysis.feedback_type]}
                  </span>
                  <span className="text-sm text-gray-400">
                    신뢰도: {(analysis.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-gray-300 mb-4">{analysis.preference_summary}</p>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-red-900/20 rounded p-3">
                    <h4 className="text-xs font-medium text-red-400 mb-2">피해야 할 패턴</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      {analysis.avoid_patterns.map((p, i) => (
                        <li key={i}>✕ {p}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-green-900/20 rounded p-3">
                    <h4 className="text-xs font-medium text-green-400 mb-2">선호하는 패턴</h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      {analysis.favor_patterns.map((p, i) => (
                        <li key={i}>✓ {p}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setAnalysis(null)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  다시 분석
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '학습 데이터로 저장'}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-6 pt-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white transition"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
