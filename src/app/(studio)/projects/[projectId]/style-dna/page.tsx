'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';

// Types
interface StyleDNA {
  id: string;
  projectId: string;
  sourceName: string;
  sourceType: 'reference' | 'pd_feedback' | 'manual';
  proseStyle: string | null;
  rhythmPattern: string | null;
  dialogueStyle: string | null;
  emotionExpression: string | null;
  sceneTransition: string | null;
  actionDescription: string | null;
  bestSamples: Array<{ category: string; badExample?: string; goodExample: string; explanation?: string }>;
  avoidPatterns: string[];
  favorPatterns: string[];
  confidence: number;
  weight: number;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MergedStyleDNA {
  id: string;
  projectId: string;
  mergedProseStyle: string | null;
  mergedRhythmPattern: string | null;
  mergedDialogueStyle: string | null;
  mergedEmotionExpression: string | null;
  mergedSceneTransition: string | null;
  mergedActionDescription: string | null;
  mergedBestSamples: Array<{ category: string; badExample?: string; goodExample: string; explanation?: string }>;
  mergedAvoidPatterns: string[];
  mergedFavorPatterns: string[];
  sourceCount: number;
  referenceCount: number;
  pdFeedbackCount: number;
  averageConfidence: number;
  version: number;
  lastMergedAt: string;
}

interface DNAStats {
  total: number;
  active: number;
  referenceCount: number;
  pdFeedbackCount: number;
  manualCount: number;
}

export default function StyleDNAPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [dnas, setDnas] = useState<StyleDNA[]>([]);
  const [mergedDNA, setMergedDNA] = useState<MergedStyleDNA | null>(null);
  const [stats, setStats] = useState<DNAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDNA, setSelectedDNA] = useState<StyleDNA | null>(null);

  // Add modal states
  const [referenceText, setReferenceText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [merging, setMerging] = useState(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch DNAs list
      const dnaRes = await fetch(`/api/projects/${projectId}/style-dna`);
      if (!dnaRes.ok) throw new Error('StyleDNA 목록 조회 실패');
      const dnaData = await dnaRes.json();
      setDnas(dnaData.dnas || []);
      setStats(dnaData.stats || null);

      // Fetch merged DNA
      const mergedRes = await fetch(`/api/projects/${projectId}/style-dna/merged`);
      if (mergedRes.ok) {
        const mergedData = await mergedRes.json();
        setMergedDNA(mergedData.mergedDNA || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Analyze reference text
  const handleAnalyze = async () => {
    if (!referenceText.trim() || !sourceName.trim()) {
      alert('레퍼런스 텍스트와 소스 이름을 입력해주세요.');
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch('/api/ai/analyze-style', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          text: referenceText,
          sourceName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '분석 실패');
      }

      // Success
      setShowAddModal(false);
      setReferenceText('');
      setSourceName('');
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '분석 중 오류 발생');
    } finally {
      setAnalyzing(false);
    }
  };

  // Merge DNAs
  const handleMerge = async () => {
    setMerging(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/style-dna/merge`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '합성 실패');
      }

      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '합성 중 오류 발생');
    } finally {
      setMerging(false);
    }
  };

  // Toggle DNA active status
  const handleToggleActive = async (dna: StyleDNA) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/style-dna/${dna.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !dna.isActive }),
      });

      if (!res.ok) throw new Error('상태 변경 실패');
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경 중 오류 발생');
    }
  };

  // Delete DNA
  const handleDelete = async (dna: StyleDNA) => {
    if (!confirm(`"${dna.sourceName}" DNA를 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/style-dna/${dna.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('삭제 실패');
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '삭제 중 오류 발생');
    }
  };

  // Source type badge color
  const getSourceTypeColor = (type: string) => {
    switch (type) {
      case 'reference':
        return 'bg-blue-500/20 text-blue-400';
      case 'pd_feedback':
        return 'bg-purple-500/20 text-purple-400';
      case 'manual':
        return 'bg-green-500/20 text-green-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getSourceTypeLabel = (type: string) => {
    switch (type) {
      case 'reference':
        return '레퍼런스';
      case 'pd_feedback':
        return 'PD 피드백';
      case 'manual':
        return '수동 추가';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>🧬</span>
              문체 DNA
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              레퍼런스 분석 + PD 피드백 학습으로 AI 작가의 필력이 진화합니다
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleMerge}
              disabled={merging || dnas.filter(d => d.isActive).length === 0}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition flex items-center gap-2"
            >
              {merging ? '합성 중...' : '🔄 DNA 재합성'}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2"
            >
              + 레퍼런스 추가
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Merged DNA Preview */}
        {mergedDNA && (
          <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>🧪</span>
                합성 DNA
                <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded">
                  v{mergedDNA.version}
                </span>
              </h2>
              <div className="text-sm text-gray-400">
                마지막 합성: {new Date(mergedDNA.lastMergedAt).toLocaleString('ko-KR')}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{mergedDNA.referenceCount}</div>
                <div className="text-xs text-gray-400">레퍼런스</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">{mergedDNA.pdFeedbackCount}</div>
                <div className="text-xs text-gray-400">PD 피드백</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-400">{Math.round(mergedDNA.averageConfidence * 100)}%</div>
                <div className="text-xs text-gray-400">신뢰도</div>
              </div>
            </div>

            {/* DNA Preview */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {mergedDNA.mergedProseStyle && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">산문 스타일</div>
                  <div className="text-gray-300 line-clamp-2">{mergedDNA.mergedProseStyle}</div>
                </div>
              )}
              {mergedDNA.mergedDialogueStyle && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">대사 스타일</div>
                  <div className="text-gray-300 line-clamp-2">{mergedDNA.mergedDialogueStyle}</div>
                </div>
              )}
              {mergedDNA.mergedAvoidPatterns.length > 0 && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">회피 패턴</div>
                  <div className="flex flex-wrap gap-1">
                    {mergedDNA.mergedAvoidPatterns.slice(0, 5).map((pattern, i) => (
                      <span key={i} className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {mergedDNA.mergedFavorPatterns.length > 0 && (
                <div className="bg-gray-800/30 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">선호 패턴</div>
                  <div className="flex flex-wrap gap-1">
                    {mergedDNA.mergedFavorPatterns.slice(0, 5).map((pattern, i) => (
                      <span key={i} className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                        {pattern}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">{stats.total}</div>
              <div className="text-xs text-gray-400">전체 DNA</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{stats.active}</div>
              <div className="text-xs text-gray-400">활성화</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400">{stats.referenceCount}</div>
              <div className="text-xs text-gray-400">레퍼런스</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{stats.pdFeedbackCount}</div>
              <div className="text-xs text-gray-400">PD 피드백</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-400">{stats.manualCount}</div>
              <div className="text-xs text-gray-400">수동</div>
            </div>
          </div>
        )}

        {/* DNA List */}
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">StyleDNA 목록</h2>
          </div>

          {dnas.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <div className="text-4xl mb-4">🧬</div>
              <p>아직 추가된 StyleDNA가 없습니다.</p>
              <p className="text-sm mt-2">레퍼런스 소설을 분석하거나, 직접 작성해보세요.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {dnas.map((dna) => (
                <div
                  key={dna.id}
                  className={`p-4 hover:bg-gray-700/50 transition ${
                    !dna.isActive ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggleActive(dna)}
                        className={`w-10 h-6 rounded-full transition relative ${
                          dna.isActive ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                            dna.isActive ? 'left-5' : 'left-1'
                          }`}
                        />
                      </button>

                      {/* Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{dna.sourceName}</span>
                          <span className={`px-2 py-0.5 rounded text-xs ${getSourceTypeColor(dna.sourceType)}`}>
                            {getSourceTypeLabel(dna.sourceType)}
                          </span>
                          <span className="text-xs text-gray-500">v{dna.version}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          신뢰도: {Math.round(dna.confidence * 100)}% | 가중치: {dna.weight}x
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedDNA(dna);
                          setShowDetailModal(true);
                        }}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-600 rounded transition"
                      >
                        상세보기
                      </button>
                      <button
                        onClick={() => handleDelete(dna)}
                        className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded transition"
                      >
                        삭제
                      </button>
                    </div>
                  </div>

                  {/* Preview */}
                  {dna.proseStyle && (
                    <div className="mt-3 text-sm text-gray-400 line-clamp-2">
                      {dna.proseStyle}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Reference Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <h2 className="text-xl font-semibold text-white">레퍼런스 추가</h2>
              <p className="text-sm text-gray-400 mt-1">
                참고할 소설 텍스트를 붙여넣으면 AI가 문체를 분석합니다.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  소스 이름 *
                </label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="예: 화산귀환, 전지적 독자 시점"
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  레퍼런스 텍스트 * <span className="text-gray-500">(최소 1,000자 권장)</span>
                </label>
                <textarea
                  value={referenceText}
                  onChange={(e) => setReferenceText(e.target.value)}
                  placeholder="분석할 소설 텍스트를 붙여넣으세요..."
                  rows={12}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none font-mono text-sm"
                />
                <div className="text-xs text-gray-500 mt-1 text-right">
                  {referenceText.length.toLocaleString()}자
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setReferenceText('');
                  setSourceName('');
                }}
                className="px-4 py-2 text-gray-400 hover:text-white transition"
              >
                취소
              </button>
              <button
                onClick={handleAnalyze}
                disabled={analyzing || !referenceText.trim() || !sourceName.trim()}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition flex items-center gap-2"
              >
                {analyzing ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    분석 중...
                  </>
                ) : (
                  '분석 시작'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedDNA && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  {selectedDNA.sourceName}
                  <span className={`px-2 py-0.5 rounded text-xs ${getSourceTypeColor(selectedDNA.sourceType)}`}>
                    {getSourceTypeLabel(selectedDNA.sourceType)}
                  </span>
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  생성일: {new Date(selectedDNA.createdAt).toLocaleString('ko-KR')}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-white">{Math.round(selectedDNA.confidence * 100)}%</div>
                  <div className="text-xs text-gray-400">신뢰도</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-white">{selectedDNA.weight}x</div>
                  <div className="text-xs text-gray-400">가중치</div>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-white">v{selectedDNA.version}</div>
                  <div className="text-xs text-gray-400">버전</div>
                </div>
              </div>

              {/* DNA Elements */}
              <div className="space-y-4">
                {selectedDNA.proseStyle && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">산문 스타일</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 text-gray-200 text-sm whitespace-pre-wrap">
                      {selectedDNA.proseStyle}
                    </div>
                  </div>
                )}

                {selectedDNA.rhythmPattern && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">리듬 패턴</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 text-gray-200 text-sm whitespace-pre-wrap">
                      {selectedDNA.rhythmPattern}
                    </div>
                  </div>
                )}

                {selectedDNA.dialogueStyle && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">대사 스타일</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 text-gray-200 text-sm whitespace-pre-wrap">
                      {selectedDNA.dialogueStyle}
                    </div>
                  </div>
                )}

                {selectedDNA.emotionExpression && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">감정 표현</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 text-gray-200 text-sm whitespace-pre-wrap">
                      {selectedDNA.emotionExpression}
                    </div>
                  </div>
                )}

                {selectedDNA.sceneTransition && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">장면 전환</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 text-gray-200 text-sm whitespace-pre-wrap">
                      {selectedDNA.sceneTransition}
                    </div>
                  </div>
                )}

                {selectedDNA.actionDescription && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">액션 묘사</h3>
                    <div className="bg-gray-700/50 rounded-lg p-4 text-gray-200 text-sm whitespace-pre-wrap">
                      {selectedDNA.actionDescription}
                    </div>
                  </div>
                )}

                {selectedDNA.avoidPatterns.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">회피 패턴</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedDNA.avoidPatterns.map((pattern, i) => (
                        <span key={i} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                          {pattern}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDNA.favorPatterns.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">선호 패턴</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedDNA.favorPatterns.map((pattern, i) => (
                        <span key={i} className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                          {pattern}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDNA.bestSamples.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-300 mb-2">모범 샘플</h3>
                    <div className="space-y-3">
                      {selectedDNA.bestSamples.map((sample, i) => (
                        <div key={i} className="bg-gray-700/50 rounded-lg p-4">
                          <div className="text-xs text-gray-500 mb-2">{sample.category}</div>
                          {sample.badExample && (
                            <div className="mb-2">
                              <span className="text-xs text-red-400">나쁜 예:</span>
                              <div className="text-sm text-gray-400 mt-1">{sample.badExample}</div>
                            </div>
                          )}
                          <div>
                            <span className="text-xs text-green-400">좋은 예:</span>
                            <div className="text-sm text-gray-200 mt-1">{sample.goodExample}</div>
                          </div>
                          {sample.explanation && (
                            <div className="mt-2 text-xs text-gray-500">{sample.explanation}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
