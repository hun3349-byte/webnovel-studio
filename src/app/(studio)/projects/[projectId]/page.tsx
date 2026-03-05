'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Project {
  id: string;
  title: string;
  genre: string | null;
  status: string;
  total_episodes: number;
  created_at: string;
  updated_at: string;
}

interface Stats {
  totalEpisodes: number;
  publishedEpisodes: number;
  characterCount: number;
  unresolvedHooks: number;
  logStatus: string;
}

interface ImportResult {
  worldBible: boolean;
  characters: string[];
  storyHooks: string[];
  errors: string[];
}

export default function ProjectDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<Stats>({
    totalEpisodes: 0,
    publishedEpisodes: 0,
    characterCount: 0,
    unresolvedHooks: 0,
    logStatus: '정상',
  });
  const [loading, setLoading] = useState(true);
  const [creatingEpisode, setCreatingEpisode] = useState(false);

  // Legacy Import State
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load project
      const projectRes = await fetch(`/api/projects/${projectId}`);
      if (projectRes.ok) {
        const data = await projectRes.json();
        setProject(data.project);
      }

      // Load episodes count
      const episodesRes = await fetch(`/api/projects/${projectId}/episodes`);
      if (episodesRes.ok) {
        const data = await episodesRes.json();
        const episodes = data.episodes || [];
        setStats(prev => ({
          ...prev,
          totalEpisodes: episodes.length,
          publishedEpisodes: episodes.filter((e: { status: string }) => e.status === 'published').length,
        }));
      }

      // Load characters count
      const charsRes = await fetch(`/api/projects/${projectId}/characters`);
      if (charsRes.ok) {
        const data = await charsRes.json();
        setStats(prev => ({
          ...prev,
          characterCount: data.characters?.length || 0,
        }));
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 새 에피소드 생성 후 에디터로 이동
  const handleStartWriting = async () => {
    try {
      setCreatingEpisode(true);

      const res = await fetch(`/api/projects/${projectId}/episodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          episode_number: stats.totalEpisodes + 1,
          title: `${stats.totalEpisodes + 1}화`,
          content: '',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create episode');
      }

      const data = await res.json();
      router.push(`/projects/${projectId}/episodes/${data.episode.id}`);
    } catch (error) {
      console.error('Failed to create episode:', error);
      alert('에피소드 생성에 실패했습니다.');
    } finally {
      setCreatingEpisode(false);
    }
  };

  // Legacy JSON Import Handler
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state
    setImportError(null);
    setImportResult(null);
    setImporting(true);

    try {
      // Read file
      const text = await file.text();
      let jsonData;

      try {
        jsonData = JSON.parse(text);
      } catch {
        throw new Error('유효하지 않은 JSON 파일입니다.');
      }

      // Call import API
      const res = await fetch(`/api/projects/${projectId}/import-legacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: jsonData }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || '임포트에 실패했습니다.');
      }

      setImportResult(result.result);

      // Reload data to reflect changes
      await loadData();

      // Show success message
      alert(`임포트 완료!\n\n- 세계관: ${result.result.worldBible ? '성공' : '스킵'}\n- 캐릭터: ${result.result.characters.length}명\n- 떡밥: ${result.result.storyHooks.length}개\n${result.result.errors.length > 0 ? `\n경고: ${result.result.errors.length}개 오류` : ''}`);

    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      setImportError(message);
      alert(`임포트 실패: ${message}`);
    } finally {
      setImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Import Button - Top Right */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleImportClick}
            disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition"
          >
            {importing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>임포트 중...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span>이전 데이터 불러오기 (JSON)</span>
              </>
            )}
          </button>
        </div>

        {/* Import Result Toast */}
        {importResult && (
          <div className="mb-4 p-4 bg-green-900/50 border border-green-700 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div className="flex-1">
                <h4 className="font-medium text-green-400">임포트 완료</h4>
                <div className="mt-1 text-sm text-green-300/80">
                  <p>세계관: {importResult.worldBible ? '성공' : '스킵'}</p>
                  {importResult.characters.length > 0 && (
                    <p>캐릭터: {importResult.characters.join(', ')}</p>
                  )}
                  {importResult.storyHooks.length > 0 && (
                    <p>떡밥: {importResult.storyHooks.length}개 추가</p>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs text-yellow-400">
                    경고: {importResult.errors.join(', ')}
                  </div>
                )}
              </div>
              <button
                onClick={() => setImportResult(null)}
                className="text-green-400 hover:text-green-300"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Import Error Toast */}
        {importError && (
          <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex-1">
                <h4 className="font-medium text-red-400">임포트 실패</h4>
                <p className="mt-1 text-sm text-red-300/80">{importError}</p>
              </div>
              <button
                onClick={() => setImportError(null)}
                className="text-red-400 hover:text-red-300"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-400 mb-1">총 에피소드</h3>
            <p className="text-3xl font-bold text-white">{stats.totalEpisodes}</p>
            <p className="text-xs text-gray-500 mt-1">
              발행됨: {stats.publishedEpisodes}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-400 mb-1">미해결 떡밥</h3>
            <p className="text-3xl font-bold text-amber-400">{stats.unresolvedHooks}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-400 mb-1">등장인물</h3>
            <p className="text-3xl font-bold text-white">{stats.characterCount}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-400 mb-1">Memory Pipeline</h3>
            <p className="text-sm font-medium text-green-400">{stats.logStatus}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">빠른 시작</h3>
            <div className="space-y-3">
              <Link
                href={`/projects/${projectId}/world-bible`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">세계관 설정</span>
                <span className="text-gray-400 text-sm block">
                  World Bible 작성 및 수정
                </span>
              </Link>
              <Link
                href={`/projects/${projectId}/characters`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">캐릭터 관리</span>
                <span className="text-gray-400 text-sm block">
                  등장인물 추가 및 편집
                </span>
              </Link>
              <Link
                href={`/projects/${projectId}/writing-memory`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">Writing Memory</span>
                <span className="text-gray-400 text-sm block">
                  자가진화 피드백 학습 시스템
                </span>
              </Link>
              <button
                onClick={handleStartWriting}
                disabled={creatingEpisode}
                className="block w-full px-4 py-3 bg-blue-600 rounded-lg hover:bg-blue-700 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="font-medium">
                  {creatingEpisode ? '생성 중...' : '에피소드 집필'}
                </span>
                <span className="text-blue-200 text-sm block">
                  {stats.totalEpisodes > 0
                    ? `${stats.totalEpisodes + 1}화 작성하기`
                    : '1화 시작하기'}
                </span>
              </button>
              <Link
                href={`/projects/${projectId}/episodes`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">에피소드 목록</span>
                <span className="text-gray-400 text-sm block">
                  작성된 에피소드 관리
                </span>
              </Link>
              <Link
                href={`/projects/${projectId}/timeline`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">스토리 타임라인</span>
                <span className="text-gray-400 text-sm block">
                  회차별 스토리 흐름 및 떡밥 추적
                </span>
              </Link>
              <Link
                href={`/projects/${projectId}/export`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">플랫폼 내보내기</span>
                <span className="text-gray-400 text-sm block">
                  네이버 시리즈 / 문피아 형식 변환
                </span>
              </Link>
              <Link
                href={`/projects/${projectId}/quality`}
                className="block w-full px-4 py-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition text-left"
              >
                <span className="font-medium">퀄리티 검증</span>
                <span className="text-gray-400 text-sm block">
                  상업 웹소설 품질 자동 분석
                </span>
              </Link>
            </div>
          </div>

          {/* Memory Pipeline Status */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Memory Pipeline</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-900 rounded-full flex items-center justify-center">
                  <span className="text-green-400">1</span>
                </div>
                <div>
                  <div className="font-medium">World Bible</div>
                  <div className="text-sm text-gray-400">세계관 규칙 로드</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-900 rounded-full flex items-center justify-center">
                  <span className="text-green-400">2</span>
                </div>
                <div>
                  <div className="font-medium">Episode Logs</div>
                  <div className="text-sm text-gray-400">
                    직전 회차 요약 슬라이딩 윈도우
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-900 rounded-full flex items-center justify-center">
                  <span className="text-green-400">3</span>
                </div>
                <div>
                  <div className="font-medium">Writing Memory</div>
                  <div className="text-sm text-gray-400">학습된 스타일 규칙 4개</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-900 rounded-full flex items-center justify-center">
                  <span className="text-blue-400">4</span>
                </div>
                <div>
                  <div className="font-medium">Prompt Injection</div>
                  <div className="text-sm text-gray-400">상업 웹소설 페르소나</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Developer Tools - Hidden by default */}
        {process.env.NODE_ENV === 'development' && (
          <details className="mt-8">
            <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-400">
              개발자 도구
            </summary>
            <div className="mt-2 p-3 bg-gray-800/30 rounded-lg border border-gray-800">
              <Link
                href="/test"
                className="text-gray-500 hover:text-gray-400 text-xs"
              >
                → Claude API 스트리밍 테스트
              </Link>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
