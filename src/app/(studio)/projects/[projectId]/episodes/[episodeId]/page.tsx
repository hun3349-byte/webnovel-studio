'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CharacterStatusBoard, StoryBiblePanel, FloatingEditTooltip } from '@/components/editor';

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
  emotional_state?: string | null;
  current_location?: string | null;
  is_alive: boolean;
  injuries?: string[] | null;
  possessed_items?: string[] | null;
  tier?: number;
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

  // Panel tabs: 'context' | 'generate' | 'quality' | 'story-bible'
  const [activePanel, setActivePanel] = useState<'context' | 'generate' | 'quality' | 'story-bible'>('context');

  // Quality validation state
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    overallScore: number;
    passed: boolean;
    suggestions: string[];
  } | null>(null);

  // ★ 기능 1: 채택 후 수정 기능 (Unlock Editor)
  const [isUnlocked, setIsUnlocked] = useState(false);

  // ★ 기능 2: AI 부분 수정 기능 (Partial Edit)
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [showPartialEditModal, setShowPartialEditModal] = useState(false);
  const [partialEditInstruction, setPartialEditInstruction] = useState('');
  const [partialEditing, setPartialEditing] = useState(false);

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
    if (charCount < 4000) {
      const proceed = confirm(
        `📝 분량 안내\n\n현재 분량: ${charCount.toLocaleString()}자\n권장 분량: 4,000~6,000자\n\n권장 분량에 미달하지만 채택하시겠습니까?\n(채택 후에도 언제든 수정 가능합니다)`
      );
      if (!proceed) return;
    }

    try {
      setAdopting(true);
      setError(null);

      // First save the content
      const saveRes = await fetch(`/api/projects/${projectId}/episodes/${episodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });

      if (!saveRes.ok) {
        const saveData = await saveRes.json();
        throw new Error(saveData.error || '저장 실패');
      }

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

  // ★ 기능 1: 잠금 해제 핸들러
  const handleUnlock = () => {
    const confirmed = confirm(
      '발행된 에피소드를 수정하시겠습니까?\n\n⚠️ 주의: 수정 후 저장하면 기존 로그가 무효화되어 재생성됩니다.'
    );
    if (confirmed) {
      setIsUnlocked(true);
    }
  };

  // ★ 기능 2: 텍스트 선택 핸들러
  const handleTextSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);

    if (selected.trim().length > 0) {
      setSelectedText(selected);
      setSelectionRange({ start, end });
    } else {
      setSelectedText('');
      setSelectionRange(null);
    }
  };

  // ★ 기능 2: AI 부분 수정 핸들러 (모달용)
  const handlePartialEdit = async () => {
    if (!selectedText || !selectionRange || !partialEditInstruction.trim()) {
      alert('수정할 텍스트와 지시사항을 입력해주세요.');
      return;
    }

    await handlePartialRewrite(partialEditInstruction);
    setShowPartialEditModal(false);
    setPartialEditInstruction('');
  };

  // ★ 기능 2: AI 부분 수정 (플로팅 툴팁용)
  const handlePartialRewrite = async (instruction: string) => {
    if (!selectedText || !selectionRange) {
      throw new Error('선택된 텍스트가 없습니다.');
    }

    setPartialEditing(true);
    setError(null);

    try {
      const res = await fetch('/api/ai/partial-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: selectedText,
          instruction,
          context: {
            fullContent: content,
            beforeSelection: content.substring(Math.max(0, selectionRange.start - 500), selectionRange.start),
            afterSelection: content.substring(selectionRange.end, Math.min(content.length, selectionRange.end + 500)),
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '부분 수정 실패');
      }

      const data = await res.json();
      const newText = data.rewrittenText;

      // 선택 영역을 새 텍스트로 교체
      const newContent =
        content.substring(0, selectionRange.start) +
        newText +
        content.substring(selectionRange.end);

      setContent(newContent);
      setSelectedText('');
      setSelectionRange(null);
      setSuccessMessage('선택 영역이 수정되었습니다!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '부분 수정 실패');
      throw err;
    } finally {
      setPartialEditing(false);
    }
  };

  // 캐릭터 업데이트 핸들러
  const handleCharacterUpdate = (updatedCharacter: Character) => {
    setCharacters(prev => prev.map(c => c.id === updatedCharacter.id ? updatedCharacter : c));
  };

  // Get char count color - 경고 수준 (에러가 아님)
  const getCharCountColor = () => {
    const count = content.length;
    if (count < 4000) return 'text-amber-400'; // 노란색 경고 (에러 아님)
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
  // ★ 기능 1: 발행됐더라도 잠금해제 시 편집 가능
  const isEditable = !isPublished || isUnlocked;

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
                disabled={!isEditable}
                className="bg-transparent border-b border-gray-700 px-2 py-1 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
            {isPublished && (
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded text-xs ${isUnlocked ? 'bg-amber-600' : 'bg-green-600'}`}>
                  {isUnlocked ? '수정 중' : '발행됨'}
                </span>
                {/* ★ 기능 1: 잠금해제 버튼 */}
                {!isUnlocked && (
                  <button
                    onClick={handleUnlock}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs transition"
                  >
                    🔓 수정하기
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Char count */}
            <div className={`text-sm ${getCharCountColor()}`}>
              {content.length.toLocaleString()}자
              <span className="text-gray-500 ml-1">(4,000~6,000)</span>
            </div>

            {/* ★ 기능 2: AI 부분 수정 버튼 */}
            {selectedText && isEditable && (
              <button
                onClick={() => setShowPartialEditModal(true)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white transition"
              >
                ✨ AI 부분 수정
              </button>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !isEditable}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                saving || !isEditable
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {saving ? '저장 중...' : '저장'}
            </button>

            {/* Adopt button - 신규 채택 or 재발행 */}
            {isEditable && (
              <button
                onClick={handleAdopt}
                disabled={adopting || !content.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  adopting || !content.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {adopting ? '채택 중...' : isUnlocked ? '재발행' : '채택하기'}
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
      <div className="flex-1 flex max-w-7xl mx-auto w-full min-h-0">
        {/* Editor Panel */}
        <div className="flex-1 p-6 flex flex-col min-h-0">
          {/* ★ 선택된 텍스트 표시 */}
          {selectedText && (
            <div className="mb-2 p-2 bg-purple-900/30 border border-purple-700 rounded text-sm">
              <span className="text-purple-400">선택됨:</span>{' '}
              <span className="text-gray-300">
                {selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText}
              </span>
              <span className="text-gray-500 ml-2">({selectedText.length}자)</span>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onSelect={handleTextSelection}
            onMouseUp={handleTextSelection}
            onKeyUp={handleTextSelection}
            disabled={!isEditable || generating}
            placeholder="에피소드 내용을 작성하세요..."
            className="flex-1 w-full bg-gray-800 border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-y-auto"
            style={{ fontFamily: 'Pretendard, sans-serif', lineHeight: '1.8', minHeight: '300px' }}
          />
        </div>

        {/* Right Panel - Context + Generation Controls */}
        <div className="w-[420px] border-l border-gray-800 flex flex-col overflow-hidden">
          {/* Panel Tabs */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActivePanel('context')}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition ${
                activePanel === 'context'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              컨텍스트
            </button>
            <button
              onClick={() => setActivePanel('story-bible')}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition ${
                activePanel === 'story-bible'
                  ? 'text-white bg-gray-800 border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              시놉시스
            </button>
            <button
              onClick={() => setActivePanel('generate')}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition ${
                activePanel === 'generate'
                  ? 'text-white bg-gray-800 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              AI 생성
            </button>
            <button
              onClick={() => setActivePanel('quality')}
              className={`flex-1 px-2 py-2.5 text-xs font-medium transition ${
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

              {/* Active Characters - 기본 목록 */}
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
                        <span className="text-xs text-gray-500">{char.role}</span>
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

              {/* ★ v8.4 캐릭터 상태창 (Status Board) - 별도 카드 */}
              <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-lg p-4 border border-cyan-800/30">
                <h3 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center gap-2">
                  <span>📊</span> 캐릭터 상태창
                </h3>
                <CharacterStatusBoard
                  projectId={projectId}
                  characters={characters}
                  onCharacterUpdate={handleCharacterUpdate}
                  compact={false}
                />
                {characters.length > 0 && (
                  <Link
                    href={`/projects/${projectId}/characters`}
                    className="block mt-3 text-xs text-cyan-400 hover:text-cyan-300 text-center transition"
                  >
                    캐릭터 상세 관리 →
                  </Link>
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
          ) : activePanel === 'story-bible' ? (
          /* Story Bible Panel - v8.4 시놉시스/타임라인 입력 */
          <div className="flex-1 overflow-y-auto p-4">
            <StoryBiblePanel
              projectId={projectId}
              targetEpisodeNumber={episode?.episode_number || 1}
              onSynopsisChange={(synopsis) => {
                // 시놉시스 변경 시 필요한 로직 추가 가능
                console.log('[StoryBible] Synopsis updated:', synopsis.length, 'chars');
              }}
            />
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
                  {content.length < 4000 ? `권장보다 ${(4000 - content.length).toLocaleString()}자 적음` :
                   content.length > 6000 ? `권장보다 ${(content.length - 6000).toLocaleString()}자 많음` :
                   '✓ 권장 범위'}
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

      {/* ★ 기능 2: 플로팅 부분 수정 툴팁 (v8.4) */}
      <FloatingEditTooltip
        selectedText={selectedText}
        selectionRange={selectionRange}
        textareaRef={textareaRef}
        onRewrite={handlePartialRewrite}
        disabled={!isEditable || generating || partialEditing}
      />

      {/* ★ 기능 2: AI 부분 수정 모달 (대체 UI) */}
      {showPartialEditModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 w-[600px] max-w-[90vw] max-h-[80vh] overflow-y-auto">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              ✨ AI 부분 수정
            </h2>

            {/* 선택된 텍스트 표시 */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">선택된 텍스트</label>
              <div className="bg-gray-900 rounded-lg p-3 text-sm max-h-32 overflow-y-auto border border-gray-700">
                {selectedText}
              </div>
              <div className="text-xs text-gray-500 mt-1">{selectedText.length}자</div>
            </div>

            {/* 수정 지시사항 */}
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">수정 지시사항</label>
              <textarea
                value={partialEditInstruction}
                onChange={e => setPartialEditInstruction(e.target.value)}
                placeholder="예: 이 부분을 더 긴장감 있게 수정해줘 / 문장을 더 길고 밀도 있게 바꿔줘 / 전투 묘사를 더 현실적으로..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none h-24"
              />
            </div>

            {/* 안내 메시지 */}
            <div className="mb-4 p-3 bg-purple-900/30 border border-purple-700 rounded-lg text-sm text-gray-300">
              <p>💡 AI가 선택된 부분만 수정합니다. 앞뒤 문맥을 파악해 자연스럽게 연결됩니다.</p>
            </div>

            {/* 버튼 */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowPartialEditModal(false);
                  setPartialEditInstruction('');
                }}
                disabled={partialEditing}
                className="px-4 py-2 rounded-lg text-gray-400 hover:text-white transition"
              >
                취소
              </button>
              <button
                onClick={handlePartialEdit}
                disabled={partialEditing || !partialEditInstruction.trim()}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  partialEditing || !partialEditInstruction.trim()
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {partialEditing ? 'AI 수정 중...' : 'AI로 수정하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
