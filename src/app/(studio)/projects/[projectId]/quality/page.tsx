'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Episode {
  id: string;
  episode_number: number;
  title: string | null;
  content: string;
  char_count: number;
  status: string;
}

interface ValidationResult {
  overallScore: number;
  passed: boolean;
  scores: {
    charCount: {
      score: number;
      charCount: number;
      status: 'under' | 'good' | 'over';
    };
    cliffhanger: {
      score: number;
      detectedType: string | null;
      explanation: string;
    };
    showDontTell: {
      score: number;
      violations: { text: string; suggestion: string }[];
      violationCount: number;
    };
    dialogueRatio: {
      score: number;
      dialoguePercent: number;
      isBalanced: boolean;
    };
    sentenceRhythm: {
      score: number;
      avgSentenceLength: number;
      hasGoodRhythm: boolean;
    };
    forbiddenWords: {
      score: number;
      violations: { word: string; context: string }[];
      violationCount: number;
    };
  };
  suggestions: string[];
  warnings: string[];
}

interface FirstEpisodeChecks {
  hasStrongOpening: boolean;
  hasProtagonistIntro: boolean;
  hasWorldHint: boolean;
  hasHook: boolean;
}

export default function QualityPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [firstEpChecks, setFirstEpChecks] = useState<FirstEpisodeChecks | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);

  const loadEpisodes = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/episodes`);
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setEpisodes(data.episodes || []);
    } catch {
      console.error('Failed to load episodes');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEpisodes();
  }, [loadEpisodes]);

  const [validationError, setValidationError] = useState<string | null>(null);

  const handleValidate = async (episode: Episode) => {
    setSelectedEpisode(episode);
    setValidationError(null);

    // Check for empty content before API call
    if (!episode.content || episode.content.trim().length === 0) {
      setValidationError('에피소드 내용이 비어있습니다. 먼저 내용을 작성해주세요.');
      return;
    }

    // Check for minimum content length
    if (episode.content.trim().length < 100) {
      setValidationError('에피소드 내용이 너무 짧습니다. 최소 100자 이상 작성해주세요.');
      return;
    }

    setValidating(true);
    setValidationResult(null);
    setFirstEpChecks(null);

    try {
      const res = await fetch('/api/ai/validate-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: episode.content,
          episodeNumber: episode.episode_number,
          mode: episode.episode_number === 1 ? 'first-episode' : 'full',
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `서버 오류 (${res.status})`);
      }

      const data = await res.json();
      setValidationResult(data.result);
      if (data.firstEpisodeChecks) {
        setFirstEpChecks(data.firstEpisodeChecks);
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : '검증에 실패했습니다.');
    } finally {
      setValidating(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-600';
    if (score >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 text-white overflow-y-auto">
      {/* Page Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold">퀄리티 검증</h1>
          <span className="text-sm text-gray-500">상업 웹소설 품질 자동 분석</span>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* 에피소드 목록 */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">에피소드 선택</h2>

              {episodes.length === 0 ? (
                <p className="text-gray-400 text-sm">에피소드가 없습니다.</p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {episodes.map(ep => (
                    <button
                      key={ep.id}
                      onClick={() => handleValidate(ep)}
                      disabled={validating}
                      className={`w-full text-left p-3 rounded-lg transition ${
                        selectedEpisode?.id === ep.id
                          ? 'bg-blue-600'
                          : 'bg-gray-700 hover:bg-gray-600'
                      } ${validating ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="font-medium">
                        {ep.episode_number}화: {ep.title || '제목 없음'}
                      </div>
                      <div className="text-sm text-gray-400">
                        {ep.char_count.toLocaleString()}자
                        {ep.status === 'published' && (
                          <span className="ml-2 text-green-400">발행됨</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 검증 결과 */}
          <div className="lg:col-span-2">
            {validationError ? (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">⚠️</div>
                  <div>
                    <h2 className="text-lg font-semibold text-red-400">검증 오류</h2>
                    <p className="text-gray-300 mt-1">{validationError}</p>
                  </div>
                </div>
                <button
                  onClick={() => setValidationError(null)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition"
                >
                  다른 에피소드 선택하기
                </button>
              </div>
            ) : validating ? (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <div className="text-2xl mb-4">🔍</div>
                <div className="text-lg">검증 중...</div>
              </div>
            ) : validationResult ? (
              <div className="space-y-6">
                {/* 전체 점수 */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                      {selectedEpisode?.episode_number}화 검증 결과
                    </h2>
                    <div
                      className={`px-4 py-2 rounded-lg font-bold ${
                        validationResult.passed
                          ? 'bg-green-600 text-white'
                          : 'bg-red-600 text-white'
                      }`}
                    >
                      {validationResult.passed ? '통과' : '미통과'}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div
                      className={`text-6xl font-bold ${getScoreColor(
                        validationResult.overallScore
                      )}`}
                    >
                      {validationResult.overallScore}
                    </div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getScoreBg(validationResult.overallScore)} transition-all`}
                          style={{ width: `${validationResult.overallScore}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>0</span>
                        <span>50</span>
                        <span>100</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1화 특화 체크 */}
                {firstEpChecks && (
                  <div className="bg-gray-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">1화 필수 체크리스트</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <CheckItem
                        label="강렬한 시작"
                        checked={firstEpChecks.hasStrongOpening}
                        description="감각적/충격적 첫 문장"
                      />
                      <CheckItem
                        label="주인공 소개"
                        checked={firstEpChecks.hasProtagonistIntro}
                        description="주인공 등장 및 소개"
                      />
                      <CheckItem
                        label="세계관 힌트"
                        checked={firstEpChecks.hasWorldHint}
                        description="배경 세계 암시"
                      />
                      <CheckItem
                        label="떡밥/미스터리"
                        checked={firstEpChecks.hasHook}
                        description="궁금증 유발 요소"
                      />
                    </div>
                  </div>
                )}

                {/* 상세 점수 */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold mb-4">상세 분석</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <ScoreCard
                      title="분량"
                      score={validationResult.scores.charCount.score}
                      detail={`${validationResult.scores.charCount.charCount.toLocaleString()}자`}
                      status={validationResult.scores.charCount.status}
                    />
                    <ScoreCard
                      title="절단신공"
                      score={validationResult.scores.cliffhanger.score}
                      detail={
                        validationResult.scores.cliffhanger.detectedType
                          ? `"${validationResult.scores.cliffhanger.detectedType}" 감지`
                          : '패턴 미감지'
                      }
                    />
                    <ScoreCard
                      title="Show Don't Tell"
                      score={validationResult.scores.showDontTell.score}
                      detail={`위반 ${validationResult.scores.showDontTell.violationCount}건`}
                    />
                    <ScoreCard
                      title="대사 비율"
                      score={validationResult.scores.dialogueRatio.score}
                      detail={`대사 ${validationResult.scores.dialogueRatio.dialoguePercent}%`}
                    />
                    <ScoreCard
                      title="문장 리듬"
                      score={validationResult.scores.sentenceRhythm.score}
                      detail={`평균 ${validationResult.scores.sentenceRhythm.avgSentenceLength}자/문장`}
                    />
                    <ScoreCard
                      title="금기어"
                      score={validationResult.scores.forbiddenWords.score}
                      detail={`위반 ${validationResult.scores.forbiddenWords.violationCount}건`}
                    />
                  </div>
                </div>

                {/* 개선 제안 */}
                {validationResult.suggestions.length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4 text-blue-400">
                      💡 개선 제안
                    </h3>
                    <ul className="space-y-2">
                      {validationResult.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-gray-300">
                          <span className="text-blue-400">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 경고 */}
                {validationResult.warnings.length > 0 && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4 text-red-400">
                      ⚠️ 경고
                    </h3>
                    <ul className="space-y-2">
                      {validationResult.warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-2 text-red-300">
                          <span className="text-red-400">!</span>
                          <span>{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Show Don't Tell 상세 */}
                {validationResult.scores.showDontTell.violations.length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-6">
                    <h3 className="text-lg font-semibold mb-4">
                      Show Don&apos;t Tell 위반 상세
                    </h3>
                    <div className="space-y-3">
                      {validationResult.scores.showDontTell.violations.map((v, i) => (
                        <div
                          key={i}
                          className="p-3 bg-gray-700/50 rounded-lg"
                        >
                          <div className="text-red-400 text-sm mb-1">
                            &quot;{v.text}&quot;
                          </div>
                          <div className="text-green-400 text-sm">
                            → {v.suggestion}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <div className="text-4xl mb-4">📊</div>
                <h2 className="text-xl font-semibold mb-2">에피소드 품질 분석</h2>
                <p className="text-gray-400">
                  왼쪽에서 에피소드를 선택하면 자동으로 품질을 분석합니다.
                </p>
                <div className="mt-6 text-left max-w-md mx-auto text-sm text-gray-500">
                  <p className="font-medium text-gray-400 mb-2">검증 항목:</p>
                  <ul className="space-y-1">
                    <li>• 분량 (4,000~6,000자)</li>
                    <li>• 절단신공 (클리프행어)</li>
                    <li>• Show Don&apos;t Tell (감정 직접 서술 금지)</li>
                    <li>• 대사 비율 (70/30 법칙)</li>
                    <li>• 문장 리듬 (단짠단짠)</li>
                    <li>• 금기어 (현대 외래어)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckItem({
  label,
  checked,
  description,
}: {
  label: string;
  checked: boolean;
  description: string;
}) {
  return (
    <div
      className={`p-3 rounded-lg ${
        checked ? 'bg-green-900/30 border border-green-700' : 'bg-gray-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={checked ? 'text-green-400' : 'text-gray-500'}>
          {checked ? '✓' : '✗'}
        </span>
        <span className={checked ? 'text-green-400' : 'text-gray-400'}>
          {label}
        </span>
      </div>
      <div className="text-xs text-gray-500 mt-1">{description}</div>
    </div>
  );
}

function ScoreCard({
  title,
  score,
  detail,
  status,
}: {
  title: string;
  score: number;
  detail: string;
  status?: string;
}) {
  const getColor = (s: number) => {
    if (s >= 80) return 'text-green-400';
    if (s >= 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getBg = (s: number) => {
    if (s >= 80) return 'bg-green-600';
    if (s >= 60) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  return (
    <div className="bg-gray-700/50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400">{title}</span>
        <span className={`font-bold ${getColor(score)}`}>{score}</span>
      </div>
      <div className="h-2 bg-gray-600 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${getBg(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {detail}
        {status && status !== 'good' && (
          <span
            className={
              status === 'under' ? 'text-red-400 ml-2' : 'text-yellow-400 ml-2'
            }
          >
            ({status === 'under' ? '부족' : '초과'})
          </span>
        )}
      </div>
    </div>
  );
}
