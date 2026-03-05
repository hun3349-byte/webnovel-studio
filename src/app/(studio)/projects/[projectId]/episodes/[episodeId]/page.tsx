'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Episode {
  id: string;
  project_id: string;
  episode_number: number;
  title: string | null;
  content: string;
  char_count: number;
  status: 'draft' | 'generating' | 'review' | 'published';
  log_status: string;
}

interface StreamMessage {
  type: 'heartbeat' | 'text' | 'complete' | 'error';
  content?: string;
  message?: string;
  fullText?: string;
  charCount?: number;
}

interface WorldBible {
  id: string;
  world_name: string | null;
  time_period: string | null;
  power_system_name: string | null;
  absolute_rules: string[];
}

interface Character {
  id: string;
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'extra';
  emotional_state: string;
  current_location: string | null;
  is_alive: boolean;
}

interface StoryHook {
  id: string;
  hook_type: string;
  summary: string;
  importance: number;
  created_in_episode_number: number;
}

interface EpisodeLog {
  episode_number: number;
  summary: string;
  last_500_chars: string;
}

/**
 * 로그 상태 패널 컴포넌트
 */
function LogStatusPanel({
  logStatus,
  episodeId,
  onRetryComplete,
}: {
  logStatus: string;
  episodeId: string;
  onRetryComplete: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);

    try {
      const res = await fetch('/api/ai/retry-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Retry failed');
      }

      // 성공 시 에피소드 다시 로드
      onRetryComplete();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  // 상태별 UI
  if (logStatus === 'completed') {
    return (
      <div className="mt-4 p-4 bg-green-900/30 border border-green-800 rounded-lg text-sm">
        <h3 className="font-semibold text-green-400 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full" />
          로그 생성 완료
        </h3>
        <p className="text-gray-300">
          이 에피소드의 AI 요약 로그가 생성되어 다음 화 집필 시 컨텍스트로 활용됩니다.
        </p>
      </div>
    );
  }

  if (logStatus === 'processing') {
    return (
      <div className="mt-4 p-4 bg-blue-900/30 border border-blue-800 rounded-lg text-sm">
        <h3 className="font-semibold text-blue-400 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          로그 생성 중...
        </h3>
        <p className="text-gray-300">
          AI가 에피소드를 분석하여 요약 로그를 생성하고 있습니다.
        </p>
      </div>
    );
  }

  if (logStatus === 'failed' || logStatus === 'fallback') {
    return (
      <div className="mt-4 p-4 bg-amber-900/30 border border-amber-800 rounded-lg text-sm">
        <h3 className="font-semibold text-amber-400 mb-2 flex items-center gap-2">
          <span className="w-2 h-2 bg-amber-400 rounded-full" />
          {logStatus === 'failed' ? '로그 생성 실패' : '임시 로그 사용 중'}
        </h3>
        <p className="text-gray-300 mb-3">
          {logStatus === 'failed'
            ? 'AI 로그 생성에 실패했습니다. 재시도하거나 임시 로그가 사용됩니다.'
            : '현재 임시 로그가 사용 중입니다. AI 로그로 업그레이드할 수 있습니다.'}
        </p>
        {retryError && (
          <p className="text-red-400 text-xs mb-2">{retryError}</p>
        )}
        <button
          onClick={handleRetry}
          disabled={retrying}
          className={`px-3 py-1.5 rounded text-xs font-medium transition ${
            retrying
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          }`}
        >
          {retrying ? '재시도 중...' : 'AI 로그 재생성'}
        </button>
      </div>
    );
  }

  // pending 상태
  return (
    <div className="mt-4 p-4 bg-gray-800/50 border border-gray-700 rounded-lg text-sm">
      <h3 className="font-semibold text-gray-400 mb-2 flex items-center gap-2">
        <span className="w-2 h-2 bg-gray-400 rounded-full" />
        로그 생성 대기 중
      </h3>
      <p className="text-gray-400">
        에피소드 로그 생성이 큐에 등록되었습니다.
      </p>
    </div>
  );
}

export default function EpisodeEditorPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const episodeId = params.episodeId as string;

  const [episode, setEpisode] = useState<Episode | null>(null);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Generation settings
  const [instruction, setInstruction] = useState('');
  const [useMock, setUseMock] = useState(true);

  // Sliding Window Context
  const [worldBible, setWorldBible] = useState<WorldBible | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [unresolvedHooks, setUnresolvedHooks] = useState<StoryHook[]>([]);
  const [recentLogs, setRecentLogs] = useState<EpisodeLog[]>([]);

  // Panel tabs: 'context' | 'generate' | 'quality'
  const [activePanel, setActivePanel] = useState<'context' | 'generate' | 'quality'>('context');

  // Quality validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    overallScore: number;
    passed: boolean;
    suggestions: string[];
  } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load episode
  const loadEpisode = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}`);
      if (!res.ok) throw new Error('Failed to load');

      const data = await res.json();
      setEpisode(data.episode);
      setContent(data.episode.content || '');
      setTitle(data.episode.title || '');
    } catch {
      setError('에피소드를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [projectId, episodeId]);

  // Load sliding window context
  const loadContext = useCallback(async () => {
    try {
      // Fetch world bible, characters, hooks, and recent logs in parallel
      const [worldRes, charRes, hooksRes, logsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/world-bible`),
        fetch(`/api/projects/${projectId}/characters`),
        fetch(`/api/projects/${projectId}/hooks?status=open&limit=5`),
        fetch(`/api/projects/${projectId}/episode-logs?limit=3`),
      ]);

      if (worldRes.ok) {
        const data = await worldRes.json();
        setWorldBible(data.worldBible);
      }

      if (charRes.ok) {
        const data = await charRes.json();
        setCharacters(data.characters || []);
      }

      if (hooksRes?.ok) {
        const data = await hooksRes.json();
        setUnresolvedHooks(data.hooks || []);
      }

      if (logsRes?.ok) {
        const data = await logsRes.json();
        setRecentLogs(data.logs || []);
      }
    } catch {
      // Context loading is non-critical, ignore errors
    }
  }, [projectId]);

  useEffect(() => {
    loadEpisode();
    loadContext();
  }, [loadEpisode, loadContext]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [content]);

  // Save episode
  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`/api/projects/${projectId}/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      if (!res.ok) throw new Error('Failed to save');

      const data = await res.json();
      setEpisode(data.episode);
      setSuccessMessage('저장되었습니다!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  // Generate episode with SSE streaming
  const handleGenerate = async () => {
    if (generating) return;

    if (!instruction.trim()) {
      alert('PD 지시사항을 입력해주세요.');
      return;
    }

    setGenerating(true);
    setStatus('연결 중...');
    setError(null);
    setContent(''); // Clear existing content

    abortControllerRef.current = new AbortController();

    try {
      // 실제 프로젝트 컨텍스트 구성
      const context = worldBible ? {
        worldBible: {
          id: worldBible.id,
          project_id: projectId,
          world_name: worldBible.world_name,
          time_period: worldBible.time_period,
          power_system_name: worldBible.power_system_name,
          absolute_rules: worldBible.absolute_rules || [],
        },
        recentLogs: recentLogs.map(log => ({
          episodeNumber: log.episode_number,
          summary: log.summary,
          lastSceneAnchor: log.last_500_chars,
          isFallback: false,
        })),
        lastSceneAnchor: recentLogs[0]?.last_500_chars || '',
        activeCharacters: characters.map(char => ({
          id: char.id,
          name: char.name,
          role: char.role,
          isAlive: char.is_alive,
          currentLocation: char.current_location,
          emotionalState: char.emotional_state,
        })),
        unresolvedHooks: unresolvedHooks.map(hook => ({
          id: hook.id,
          hookType: hook.hook_type,
          summary: hook.summary,
          importance: hook.importance,
          createdInEpisodeNumber: hook.created_in_episode_number,
        })),
        writingPreferences: [],
      } : null;

      const res = await fetch('/api/ai/test-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInstruction: instruction,
          targetEpisodeNumber: episode?.episode_number || 1,
          useTestContext: !context, // 컨텍스트가 없으면 테스트 컨텍스트 사용
          context, // 실제 컨텍스트 전달
          useMock,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream not available');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const message: StreamMessage = JSON.parse(data);

              switch (message.type) {
                case 'heartbeat':
                  setStatus(message.message || 'AI 준비 중...');
                  break;
                case 'text':
                  if (message.content) {
                    fullText += message.content;
                    setContent(fullText);
                    setStatus('생성 중...');
                  }
                  break;
                case 'complete':
                  setStatus('완료!');
                  break;
                case 'error':
                  setError(message.message || 'Unknown error');
                  break;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('중단됨');
      } else {
        setError(err instanceof Error ? err.message : 'Generation failed');
      }
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // Stop generation
  const handleStopGeneration = () => {
    abortControllerRef.current?.abort();
  };

  // Adopt episode (채택) - triggers log generation
  const handleAdopt = async () => {
    if (!content.trim()) {
      alert('에피소드 내용이 비어있습니다.');
      return;
    }

    const charCount = content.length;
    if (charCount < 3500) {
      const proceed = confirm(
        `현재 분량이 ${charCount}자로 권장 분량(4,000자)보다 적습니다.\n그래도 채택하시겠습니까?`
      );
      if (!proceed) return;
    }

    try {
      setAdopting(true);
      setError(null);

      // First save the content
      await fetch(`/api/projects/${projectId}/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      // Then adopt
      const res = await fetch(
        `/api/projects/${projectId}/episodes/${episodeId}/adopt`,
        { method: 'POST' }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Adopt failed');
      }

      const data = await res.json();
      setSuccessMessage(data.message || '채택되었습니다!');

      // Reload to get updated status
      loadEpisode();

      setTimeout(() => {
        setSuccessMessage(null);
        // Navigate back to episode list
        router.push(`/projects/${projectId}/episodes`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adopt failed');
    } finally {
      setAdopting(false);
    }
  };

  // Get char count color
  const getCharCountColor = () => {
    const count = content.length;
    if (count < 4000) return 'text-red-400';
    if (count > 6000) return 'text-amber-400';
    return 'text-green-400';
  };

  // Quick quality validation
  const handleQuickValidation = async () => {
    if (!content.trim() || content.length < 100) {
      setError('검증하려면 최소 100자 이상 작성해주세요.');
      return;
    }

    setValidating(true);
    setValidationResult(null);

    try {
      const res = await fetch('/api/ai/validate-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          episodeNumber: episode?.episode_number,
          mode: 'quick',
        }),
      });

      if (!res.ok) throw new Error('Validation failed');

      const data = await res.json();
      setValidationResult({
        overallScore: data.result.overallScore,
        passed: data.result.passed,
        suggestions: data.result.suggestions || [],
      });
    } catch {
      setError('퀄리티 검증에 실패했습니다.');
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">로딩 중...</div>
      </div>
    );
  }

  const isPublished = episode?.status === 'published';

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur flex-shrink-0">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{episode?.episode_number}화</span>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="제목 입력..."
                disabled={isPublished}
                className="bg-transparent border-b border-gray-700 px-2 py-1 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
            {isPublished && (
              <span className="px-2 py-1 bg-green-600 rounded text-xs">발행됨</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Char count */}
            <div className={`text-sm ${getCharCountColor()}`}>
              {content.length.toLocaleString()}자
              <span className="text-gray-500 ml-1">(4,000~6,000)</span>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || isPublished}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                saving || isPublished
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {saving ? '저장 중...' : '저장'}
            </button>

            {/* Adopt button */}
            {!isPublished && (
              <button
                onClick={handleAdopt}
                disabled={adopting || !content.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  adopting || !content.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {adopting ? '채택 중...' : '채택하기'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 py-2 w-full">
          <div className="bg-red-900/50 border border-red-700 rounded-lg px-4 py-2 text-red-300">
            {error}
          </div>
        </div>
      )}
      {successMessage && (
        <div className="max-w-7xl mx-auto px-6 py-2 w-full">
          <div className="bg-green-900/50 border border-green-700 rounded-lg px-4 py-2 text-green-300">
            {successMessage}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Editor Panel */}
        <div className="flex-1 p-6 flex flex-col">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={isPublished || generating}
            placeholder="에피소드 내용을 작성하세요..."
            className="flex-1 w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[500px]"
            style={{ fontFamily: 'Pretendard, sans-serif', lineHeight: '1.8' }}
          />
        </div>

        {/* Right Panel - Context + Generation Controls */}
        <div className="w-[420px] border-l border-gray-800 flex flex-col overflow-hidden">
          {/* Panel Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActivePanel('context')}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition ${
                activePanel === 'context'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              컨텍스트
            </button>
            <button
              onClick={() => setActivePanel('generate')}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition ${
                activePanel === 'generate'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              AI 생성
            </button>
            <button
              onClick={() => setActivePanel('quality')}
              className={`flex-1 px-3 py-2.5 text-xs font-medium transition ${
                activePanel === 'quality'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              퀄리티
            </button>
          </div>

          {/* Context Panel */}
          {activePanel === 'context' ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* World Bible Summary */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
                  <span>🌍</span> 세계관
                </h3>
                {worldBible ? (
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">이름:</span>{' '}
                      <span className="text-gray-300">{worldBible.world_name || '미설정'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">시대:</span>{' '}
                      <span className="text-gray-300">{worldBible.time_period || '미설정'}</span>
                    </div>
                    {worldBible.power_system_name && (
                      <div>
                        <span className="text-gray-500">힘의 체계:</span>{' '}
                        <span className="text-gray-300">{worldBible.power_system_name}</span>
                      </div>
                    )}
                    {worldBible.absolute_rules?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <span className="text-gray-500 text-xs">절대 규칙:</span>
                        <ul className="mt-1 space-y-1">
                          {worldBible.absolute_rules.slice(0, 3).map((rule, i) => (
                            <li key={i} className="text-xs text-amber-300/80">• {rule}</li>
                          ))}
                          {worldBible.absolute_rules.length > 3 && (
                            <li className="text-xs text-gray-500">
                              +{worldBible.absolute_rules.length - 3}개 더...
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">세계관 미설정</p>
                )}
              </div>

              {/* Active Characters */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                  <span>👥</span> 등장인물 ({characters.length})
                </h3>
                {characters.length > 0 ? (
                  <div className="space-y-2">
                    {characters.slice(0, 5).map((char) => (
                      <div
                        key={char.id}
                        className={`flex items-center justify-between text-sm p-2 rounded ${
                          !char.is_alive ? 'bg-red-900/20' : 'bg-gray-700/30'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              char.role === 'protagonist'
                                ? 'bg-yellow-400'
                                : char.role === 'antagonist'
                                ? 'bg-red-400'
                                : 'bg-gray-400'
                            }`}
                          />
                          <span className={!char.is_alive ? 'line-through text-gray-500' : 'text-gray-200'}>
                            {char.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {char.current_location && (
                            <span className="text-gray-500">{char.current_location}</span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              char.emotional_state === 'neutral'
                                ? 'bg-gray-600 text-gray-300'
                                : char.emotional_state?.includes('분노') || char.emotional_state?.includes('angry')
                                ? 'bg-red-600/50 text-red-200'
                                : 'bg-blue-600/50 text-blue-200'
                            }`}
                          >
                            {char.emotional_state || 'neutral'}
                          </span>
                        </div>
                      </div>
                    ))}
                    {characters.length > 5 && (
                      <p className="text-xs text-gray-500 text-center">
                        +{characters.length - 5}명 더...
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">등록된 캐릭터 없음</p>
                )}
              </div>

              {/* Unresolved Hooks */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-400 mb-2 flex items-center gap-2">
                  <span>🎣</span> 미해결 떡밥 ({unresolvedHooks.length})
                </h3>
                {unresolvedHooks.length > 0 ? (
                  <div className="space-y-2">
                    {unresolvedHooks.map((hook) => (
                      <div
                        key={hook.id}
                        className="text-sm p-2 rounded bg-purple-900/20 border-l-2 border-purple-500"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-purple-300">{hook.hook_type}</span>
                          <span className="text-xs text-gray-500">{hook.created_in_episode_number}화</span>
                        </div>
                        <p className="text-gray-300 text-xs">{hook.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">미해결 떡밥 없음</p>
                )}
              </div>

              {/* Recent Episode Logs */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                  <span>📜</span> 직전 회차 요약
                </h3>
                {recentLogs.length > 0 ? (
                  <div className="space-y-2">
                    {recentLogs.map((log) => (
                      <div
                        key={log.episode_number}
                        className="text-sm p-2 rounded bg-cyan-900/20"
                      >
                        <div className="text-xs text-cyan-300 mb-1">{log.episode_number}화</div>
                        <p className="text-gray-300 text-xs line-clamp-2">{log.summary}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">이전 에피소드 로그 없음</p>
                )}
              </div>

              {/* Writing Preferences */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-400 mb-2 flex items-center gap-2">
                  <span>✍️</span> 문체 설정
                </h3>
                <ul className="space-y-1 text-xs text-gray-400">
                  <li>• 분량: 4,000~6,000자</li>
                  <li>• 절단신공 필수 (위기/반전/기대감)</li>
                  <li>• Show, Don&apos;t Tell 원칙</li>
                  <li>• 짧은 문장, 3~4문장 문단</li>
                </ul>
              </div>
            </div>
          ) : activePanel === 'generate' ? (
          /* Generation Panel */
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          <h2 className="text-lg font-semibold mb-4">AI 생성</h2>

          {/* Mock Toggle */}
          <div className="mb-4 p-3 bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">API 모드</div>
                <div className="text-xs text-gray-500">
                  {useMock ? 'Mock 모드 (테스트용)' : 'Claude API (실제 생성)'}
                </div>
              </div>
              <button
                onClick={() => setUseMock(!useMock)}
                disabled={generating}
                className={`relative w-11 h-6 rounded-full transition ${
                  useMock ? 'bg-green-600' : 'bg-gray-600'
                } ${generating ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition ${
                    useMock ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* PD Instruction */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-2">PD 지시사항</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              disabled={generating || isPublished}
              placeholder="이번 화에서 원하는 전개를 입력하세요...&#10;예: 주인공이 첫 번째 적과 조우하는 긴장감 있는 장면"
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status */}
          {(generating || status) && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                {generating && (
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                )}
                <span className="text-sm text-gray-300">{status}</span>
              </div>
            </div>
          )}

          {/* Generate / Stop Buttons */}
          <div className="flex gap-2">
            {!generating ? (
              <button
                onClick={handleGenerate}
                disabled={isPublished || !instruction.trim()}
                className={`flex-1 py-3 rounded-lg font-medium transition ${
                  isPublished || !instruction.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : useMock
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {useMock ? 'Mock 생성' : 'AI 생성'}
              </button>
            ) : (
              <button
                onClick={handleStopGeneration}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
              >
                중단
              </button>
            )}
          </div>

          {/* Info */}
          <div className="mt-6 p-4 bg-gray-800/50 rounded-lg text-xs text-gray-400">
            <h3 className="font-semibold mb-2 text-gray-300">적용되는 규칙</h3>
            <ul className="space-y-1">
              <li>- 상업 웹소설 페르소나</li>
              <li>- Writing Memory (학습된 4가지 필수 규칙)</li>
              <li>- 분량: 4,000~6,000자</li>
              <li>- 절단신공 필수</li>
              <li>- Show, Don&apos;t Tell 원칙</li>
            </ul>
          </div>

          {/* Memory Pipeline Info */}
          {isPublished && (
            <LogStatusPanel
              logStatus={episode?.log_status || 'pending'}
              episodeId={episodeId}
              onRetryComplete={loadEpisode}
            />
          )}
          </div>
          ) : (
          /* Quality Panel */
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <h2 className="text-lg font-semibold mb-4">퀄리티 검증</h2>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">글자 수</div>
                <div className={`text-xl font-bold ${getCharCountColor()}`}>
                  {content.length.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {content.length < 4000 ? `${(4000 - content.length).toLocaleString()}자 부족` :
                   content.length > 6000 ? `${(content.length - 6000).toLocaleString()}자 초과` :
                   '적정 범위'}
                </div>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <div className="text-xs text-gray-500 mb-1">대사 비율</div>
                <div className="text-xl font-bold text-white">
                  {content.length > 0 ? Math.round((content.match(/[""「」『』]/g)?.length || 0) / content.length * 1000) / 10 : 0}%
                </div>
                <div className="text-xs text-gray-500 mt-1">추정치 (기호 기준)</div>
              </div>
            </div>

            {/* Validation Result */}
            {validationResult && (
              <div className="mb-4 p-4 bg-gray-800 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">검증 점수</span>
                  <span className={`text-2xl font-bold ${
                    validationResult.overallScore >= 80 ? 'text-green-400' :
                    validationResult.overallScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {validationResult.overallScore}
                  </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all ${
                      validationResult.overallScore >= 80 ? 'bg-green-500' :
                      validationResult.overallScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${validationResult.overallScore}%` }}
                  />
                </div>
                <div className={`text-sm font-medium ${validationResult.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {validationResult.passed ? '통과' : '미통과'}
                </div>
                {validationResult.suggestions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="text-xs text-gray-500 mb-2">개선 제안:</div>
                    <ul className="space-y-1">
                      {validationResult.suggestions.slice(0, 3).map((s, i) => (
                        <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
                          <span className="text-blue-400">•</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Validate Button */}
            <button
              onClick={handleQuickValidation}
              disabled={validating || content.length < 100}
              className={`w-full py-3 rounded-lg font-medium transition ${
                validating || content.length < 100
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {validating ? '검증 중...' : '빠른 검증 실행'}
            </button>

            {content.length < 100 && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                100자 이상 작성 후 검증 가능
              </p>
            )}

            {/* Validation Criteria */}
            <div className="mt-6 p-4 bg-gray-800/50 rounded-lg text-xs text-gray-400">
              <h3 className="font-semibold mb-2 text-gray-300">검증 항목</h3>
              <ul className="space-y-1">
                <li className="flex items-center gap-2">
                  <span className={content.length >= 4000 && content.length <= 6000 ? 'text-green-400' : 'text-gray-500'}>
                    {content.length >= 4000 && content.length <= 6000 ? '✓' : '○'}
                  </span>
                  분량 (4,000~6,000자)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">○</span>
                  절단신공 (클리프행어)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">○</span>
                  Show, Don&apos;t Tell
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">○</span>
                  대사/묘사 비율
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-gray-500">○</span>
                  금기어 체크
                </li>
              </ul>
            </div>

            {/* Link to Full Quality Page */}
            <Link
              href={`/projects/${projectId}/quality`}
              className="mt-4 block text-center text-sm text-blue-400 hover:text-blue-300 transition"
            >
              상세 분석 페이지로 이동 →
            </Link>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
