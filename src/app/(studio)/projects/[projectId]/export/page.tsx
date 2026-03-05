'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Episode {
  id: string;
  episode_number: number;
  title: string | null;
  char_count: number;
  status: string;
  published_at: string | null;
}

interface ProjectInfo {
  title: string;
  genre: string | null;
  targetPlatform: string | null;
}

interface Stats {
  total: number;
  published: number;
  totalCharCount: number;
  avgCharCount: number;
}

interface ExportResult {
  episodeNumber: number;
  title: string;
  content: string;
  charCount: number;
  warnings: string[];
}

type Platform = 'naver' | 'munpia';

export default function ExportPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택 상태
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('naver');
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  // 옵션
  const [naverOptions, setNaverOptions] = useState({
    format: 'html' as 'html' | 'text',
    paragraphStyle: 'p-tag' as 'p-tag' | 'br-tag' | 'newline',
    highlightDialogue: false,
    sceneBreakStyle: 'asterisk' as 'asterisk' | 'line' | 'space',
    includeAuthorNote: false,
    authorNote: '',
  });

  const [munpiaOptions, setMunpiaOptions] = useState({
    useIndentation: true,
    indentSize: 2,
    sceneBreakStyle: 'asterisk' as 'asterisk' | 'dash' | 'space' | 'custom',
    dialogueQuoteStyle: 'double' as 'double' | 'single' | 'guillemet',
    includeAuthorComment: false,
    authorComment: '',
    includeTitle: true,
  });

  const [mergeEpisodes, setMergeEpisodes] = useState(false);

  // 결과
  const [exportResults, setExportResults] = useState<ExportResult[] | null>(null);
  const [mergedContent, setMergedContent] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/export`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      setProject(data.project);
      setEpisodes(data.episodes);
      setStats(data.stats);
    } catch {
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 전체 선택 토글
  useEffect(() => {
    if (selectAll) {
      setSelectedEpisodes(new Set(episodes.filter(e => e.status === 'published').map(e => e.id)));
    } else {
      setSelectedEpisodes(new Set());
    }
  }, [selectAll, episodes]);

  const handleToggleEpisode = (id: string) => {
    const newSet = new Set(selectedEpisodes);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedEpisodes(newSet);
    setSelectAll(false);
  };

  const handleExport = async () => {
    if (selectedEpisodes.size === 0) {
      alert('내보낼 에피소드를 선택해주세요.');
      return;
    }

    try {
      setExporting(true);
      setError(null);
      setExportResults(null);
      setMergedContent(null);

      const options = selectedPlatform === 'naver' ? naverOptions : munpiaOptions;

      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          episodeIds: Array.from(selectedEpisodes),
          options,
          merge: mergeEpisodes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Export failed');
      }

      const data = await res.json();
      setExportResults(data.results);
      if (data.merged) {
        setMergedContent(data.merged);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '내보내기에 실패했습니다.');
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    if (!exportResults) return;

    if (mergedContent) {
      handleDownload(mergedContent, `${project?.title || 'novel'}_전체.txt`);
    } else {
      exportResults.forEach(result => {
        const ext = selectedPlatform === 'naver' && naverOptions.format === 'html' ? 'html' : 'txt';
        handleDownload(
          result.content,
          `${result.episodeNumber}화_${result.title}.${ext}`
        );
      });
    }
  };

  const handleCopyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      alert('클립보드에 복사되었습니다.');
    } catch {
      alert('복사에 실패했습니다.');
    }
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
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold">플랫폼 내보내기</h1>
        </div>
      </div>

      {error && (
        <div className="px-6 py-2">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">총 에피소드</div>
              <div className="text-2xl font-bold">{stats.total}화</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">발행됨</div>
              <div className="text-2xl font-bold text-green-400">{stats.published}화</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">총 글자수</div>
              <div className="text-2xl font-bold">{stats.totalCharCount.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm text-gray-400 mb-1">평균 글자수</div>
              <div className="text-2xl font-bold">{stats.avgCharCount.toLocaleString()}</div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* 에피소드 선택 */}
          <div className="lg:col-span-2">
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">에피소드 선택</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={e => setSelectAll(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                  />
                  발행된 에피소드 전체 선택
                </label>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-2">
                {episodes.map(ep => {
                  const isPublished = ep.status === 'published';
                  const isSelected = selectedEpisodes.has(ep.id);

                  return (
                    <label
                      key={ep.id}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition ${
                        isSelected
                          ? 'bg-blue-900/30 border border-blue-700'
                          : 'bg-gray-700/50 hover:bg-gray-700'
                      } ${!isPublished ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleEpisode(ep.id)}
                        disabled={!isPublished}
                        className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {ep.episode_number}화: {ep.title || '제목 없음'}
                        </div>
                        <div className="text-sm text-gray-400">
                          {ep.char_count.toLocaleString()}자
                          {!isPublished && ' (미발행)'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 text-sm text-gray-400">
                선택됨: {selectedEpisodes.size}화
              </div>
            </div>
          </div>

          {/* 설정 패널 */}
          <div className="space-y-6">
            {/* 플랫폼 선택 */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">플랫폼</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedPlatform('naver')}
                  className={`p-4 rounded-lg border-2 transition ${
                    selectedPlatform === 'naver'
                      ? 'border-green-500 bg-green-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-2">📗</div>
                  <div className="font-medium">네이버 시리즈</div>
                  <div className="text-xs text-gray-400">HTML/텍스트</div>
                </button>
                <button
                  onClick={() => setSelectedPlatform('munpia')}
                  className={`p-4 rounded-lg border-2 transition ${
                    selectedPlatform === 'munpia'
                      ? 'border-blue-500 bg-blue-900/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-2">📘</div>
                  <div className="font-medium">문피아</div>
                  <div className="text-xs text-gray-400">텍스트</div>
                </button>
              </div>
            </div>

            {/* 플랫폼별 옵션 */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">내보내기 옵션</h2>

              {selectedPlatform === 'naver' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">출력 형식</label>
                    <select
                      value={naverOptions.format}
                      onChange={e => setNaverOptions(o => ({ ...o, format: e.target.value as 'html' | 'text' }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      <option value="html">HTML</option>
                      <option value="text">텍스트</option>
                    </select>
                  </div>

                  {naverOptions.format === 'html' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">문단 스타일</label>
                      <select
                        value={naverOptions.paragraphStyle}
                        onChange={e => setNaverOptions(o => ({ ...o, paragraphStyle: e.target.value as 'p-tag' | 'br-tag' | 'newline' }))}
                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                      >
                        <option value="p-tag">&lt;p&gt; 태그</option>
                        <option value="br-tag">&lt;br&gt; 태그</option>
                        <option value="newline">줄바꿈</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">장면 전환</label>
                    <select
                      value={naverOptions.sceneBreakStyle}
                      onChange={e => setNaverOptions(o => ({ ...o, sceneBreakStyle: e.target.value as 'asterisk' | 'line' | 'space' }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      <option value="asterisk">* * *</option>
                      <option value="line">────</option>
                      <option value="space">빈 줄</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={naverOptions.highlightDialogue}
                      onChange={e => setNaverOptions(o => ({ ...o, highlightDialogue: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm">대사 강조</span>
                  </label>
                </div>
              ) : (
                <div className="space-y-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={munpiaOptions.useIndentation}
                      onChange={e => setMunpiaOptions(o => ({ ...o, useIndentation: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm">들여쓰기 사용</span>
                  </label>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">대사 따옴표</label>
                    <select
                      value={munpiaOptions.dialogueQuoteStyle}
                      onChange={e => setMunpiaOptions(o => ({ ...o, dialogueQuoteStyle: e.target.value as 'double' | 'single' | 'guillemet' }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      <option value="double">&quot;큰따옴표&quot;</option>
                      <option value="single">&apos;작은따옴표&apos;</option>
                      <option value="guillemet">«길러멧»</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">장면 전환</label>
                    <select
                      value={munpiaOptions.sceneBreakStyle}
                      onChange={e => setMunpiaOptions(o => ({ ...o, sceneBreakStyle: e.target.value as 'asterisk' | 'dash' | 'space' }))}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg"
                    >
                      <option value="asterisk">* * *</option>
                      <option value="dash">────</option>
                      <option value="space">빈 줄</option>
                    </select>
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={munpiaOptions.includeTitle}
                      onChange={e => setMunpiaOptions(o => ({ ...o, includeTitle: e.target.checked }))}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm">제목 포함</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={mergeEpisodes}
                      onChange={e => setMergeEpisodes(e.target.checked)}
                      className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                    />
                    <span className="text-sm">전체 에피소드 합치기</span>
                  </label>
                </div>
              )}
            </div>

            {/* 내보내기 버튼 */}
            <button
              onClick={handleExport}
              disabled={exporting || selectedEpisodes.size === 0}
              className={`w-full py-4 rounded-lg font-medium text-lg transition ${
                exporting || selectedEpisodes.size === 0
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : selectedPlatform === 'naver'
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {exporting ? '내보내는 중...' : `${selectedPlatform === 'naver' ? '네이버' : '문피아'} 형식으로 내보내기`}
            </button>
          </div>
        </div>

        {/* 결과 표시 */}
        {exportResults && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">내보내기 결과</h2>
              <button
                onClick={handleDownloadAll}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
              >
                {mergedContent ? '전체 다운로드' : '모두 다운로드'}
              </button>
            </div>

            {mergedContent ? (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold">전체 합본 ({exportResults.length}화)</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCopyToClipboard(mergedContent)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                    >
                      복사
                    </button>
                    <button
                      onClick={() => handleDownload(mergedContent, `${project?.title}_전체.txt`)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                    >
                      다운로드
                    </button>
                  </div>
                </div>
                <pre className="bg-gray-900 rounded p-4 text-sm text-gray-300 max-h-[400px] overflow-auto whitespace-pre-wrap">
                  {mergedContent.slice(0, 2000)}
                  {mergedContent.length > 2000 && '\n\n... (미리보기 생략)'}
                </pre>
              </div>
            ) : (
              <div className="space-y-4">
                {exportResults.map(result => (
                  <div key={result.episodeNumber} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="font-semibold">
                          {result.episodeNumber}화: {result.title}
                        </h3>
                        <div className="text-sm text-gray-400">
                          {result.charCount.toLocaleString()}자
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCopyToClipboard(result.content)}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                        >
                          복사
                        </button>
                        <button
                          onClick={() => {
                            const ext = selectedPlatform === 'naver' && naverOptions.format === 'html' ? 'html' : 'txt';
                            handleDownload(result.content, `${result.episodeNumber}화_${result.title}.${ext}`);
                          }}
                          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
                        >
                          다운로드
                        </button>
                      </div>
                    </div>

                    {result.warnings.length > 0 && (
                      <div className="mb-3 p-2 bg-amber-900/30 border border-amber-700 rounded text-sm text-amber-300">
                        {result.warnings.map((w, i) => (
                          <div key={i}>⚠️ {w}</div>
                        ))}
                      </div>
                    )}

                    <details>
                      <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
                        미리보기
                      </summary>
                      <pre className="mt-2 bg-gray-900 rounded p-3 text-sm text-gray-300 max-h-[200px] overflow-auto whitespace-pre-wrap">
                        {result.content.slice(0, 500)}
                        {result.content.length > 500 && '...'}
                      </pre>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
