'use client';

import { useState, useRef, useCallback } from 'react';

// ============================================================================
// 스트리밍 테스트 UI
// - Claude API SSE 스트리밍 테스트
// - TTFB Heartbeat 확인
// - 실시간 글자 수 카운트
// - Mock 모드 지원
// ============================================================================

interface StreamMessage {
  type: 'heartbeat' | 'text' | 'complete' | 'error';
  content?: string;
  message?: string;
  fullText?: string;
  charCount?: number;
  timestamp?: number;
}

export default function TestGeneratePage() {
  const [instruction, setInstruction] = useState(
    '주인공이 강호에 첫발을 내딛는 장면을 작성해주세요. 첫 번째 적과 조우하는 긴장감 있는 전개로 부탁합니다.'
  );
  const [episodeNumber, setEpisodeNumber] = useState(2);
  const [generatedText, setGeneratedText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<string>('대기 중');
  const [charCount, setCharCount] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [useMock, setUseMock] = useState(true); // ★ Mock 모드 기본 활성화
  const [projectId, setProjectId] = useState(''); // ★ 프로젝트 ID (실제 DB 사용 시)
  const [useRealDb, setUseRealDb] = useState(false); // ★ 실제 DB 사용 여부
  const abortControllerRef = useRef<AbortController | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const handleGenerate = async () => {
    if (isGenerating) return;

    // 초기화
    setGeneratedText('');
    setCharCount(0);
    setLogs([]);
    setIsGenerating(true);
    setStatus('연결 중...');
    addLog(`API 요청 시작 ${useMock ? '(Mock 모드)' : '(Claude API)'}`);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/test-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userInstruction: instruction,
          targetEpisodeNumber: episodeNumber,
          // ★ 실제 DB 사용 시 projectId 전달, 아니면 테스트 컨텍스트 사용
          ...(useRealDb && projectId
            ? { projectId }
            : { useTestContext: true }),
          useMock, // ★ Mock 모드 플래그 전달
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      addLog('SSE 스트림 연결됨');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream reader not available');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE 파싱: data: {...}\n\n
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              addLog('스트림 완료');
              continue;
            }

            try {
              const message: StreamMessage = JSON.parse(data);

              switch (message.type) {
                case 'heartbeat':
                  setStatus(message.message || 'AI 준비 중...');
                  addLog(`Heartbeat: ${message.message}`);
                  break;

                case 'text':
                  if (message.content) {
                    fullText += message.content;
                    setGeneratedText(fullText);
                    setCharCount(fullText.length);
                    setStatus('생성 중...');
                  }
                  break;

                case 'complete':
                  setStatus('완료!');
                  addLog(`완료 - ${message.charCount?.toLocaleString()}자 생성`);
                  break;

                case 'error':
                  setStatus(`오류: ${message.message}`);
                  addLog(`오류: ${message.message}`);
                  break;
              }
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setStatus('중단됨');
        addLog('사용자에 의해 중단됨');
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setStatus(`오류: ${errorMessage}`);
        addLog(`오류: ${errorMessage}`);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const getCharCountColor = () => {
    if (charCount < 4000) return 'text-red-500';
    if (charCount > 6000) return 'text-amber-500';
    return 'text-green-500';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Claude API 스트리밍 테스트</h1>
        <p className="text-gray-400 mb-8">
          TTFB 방어 + SSE 스트리밍 + 상업 웹소설 페르소나 테스트
        </p>

        {/* Mock 모드 토글 */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-300">API 모드</h3>
              <p className="text-xs text-gray-500 mt-1">
                {useMock
                  ? 'Mock 모드: 미리 작성된 더미 데이터로 스트리밍 테스트'
                  : 'Claude API: 실제 AI가 에피소드 생성 (크레딧 필요)'}
              </p>
            </div>
            <button
              onClick={() => setUseMock(!useMock)}
              disabled={isGenerating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                useMock ? 'bg-green-600' : 'bg-gray-600'
              } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  useMock ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              useMock
                ? 'bg-green-900 text-green-300'
                : 'bg-blue-900 text-blue-300'
            }`}>
              {useMock ? 'Mock 모드' : 'Claude API'}
            </span>
            {!useMock && (
              <span className="text-xs text-amber-400">
                ⚠️ API 크레딧이 소모됩니다
              </span>
            )}
          </div>
        </div>

        {/* 입력 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              PD 지시사항
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="w-full h-32 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="이번 회차에서 원하는 전개를 입력하세요..."
              disabled={isGenerating}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              회차 번호
            </label>
            <input
              type="number"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(Number(e.target.value))}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              min={1}
              disabled={isGenerating}
            />

            {/* ★ DB 모드 선택 */}
            <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-300">컨텍스트 소스</h3>
                <button
                  onClick={() => setUseRealDb(!useRealDb)}
                  disabled={isGenerating}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    useRealDb ? 'bg-blue-600' : 'bg-gray-600'
                  } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      useRealDb ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {useRealDb ? (
                <div>
                  <label className="block text-xs text-gray-400 mb-2">
                    프로젝트 ID (Supabase UUID)
                  </label>
                  <input
                    type="text"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="예: 550e8400-e29b-41d4-a716-446655440000"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isGenerating}
                  />
                  <p className="text-xs text-blue-400 mt-2">
                    ✨ 실제 DB의 World Bible & Character 설정을 사용합니다
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500">
                    세계관: 검황전설의 세계 (무협)
                    <br />
                    주인공: 이청운 (청풍파 멸문 생존자)
                    <br />
                    상황: 복수를 다짐하고 강호에 첫발을 내딛는 중
                  </p>
                  <p className="text-xs text-amber-400 mt-2">
                    ⚠️ 하드코딩된 테스트 데이터입니다
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isGenerating
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : useMock
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isGenerating ? '생성 중...' : useMock ? '🧪 Mock 테스트' : '🤖 에피소드 생성'}
          </button>

          {isGenerating && (
            <button
              onClick={handleStop}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
              중단
            </button>
          )}
        </div>

        {/* 상태 표시 */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isGenerating ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
              }`}
            />
            <span className="text-sm text-gray-300">{status}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">글자 수:</span>
            <span className={`text-lg font-bold ${getCharCountColor()}`}>
              {charCount.toLocaleString()}자
            </span>
            <span className="text-xs text-gray-500">(목표: 4,000~6,000)</span>
          </div>
        </div>

        {/* 결과 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 생성된 텍스트 */}
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold mb-3">생성된 에피소드</h2>
            <div className="h-[600px] overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg p-6">
              {generatedText ? (
                <div className="whitespace-pre-wrap text-gray-200 leading-relaxed">
                  {generatedText}
                </div>
              ) : (
                <div className="text-gray-500 text-center mt-20">
                  {useMock
                    ? '🧪 Mock 테스트 버튼을 눌러 스트리밍을 테스트하세요'
                    : '🤖 에피소드 생성 버튼을 눌러 테스트하세요'}
                </div>
              )}
            </div>
          </div>

          {/* 로그 */}
          <div>
            <h2 className="text-lg font-semibold mb-3">이벤트 로그</h2>
            <div className="h-[600px] overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg p-4">
              {logs.length > 0 ? (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div key={i} className="text-xs text-gray-400 font-mono">
                      {log}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 text-sm text-center mt-10">
                  로그가 여기에 표시됩니다
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 설명 */}
        <div className="mt-8 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h3 className="text-lg font-semibold mb-3">테스트 항목</h3>
          <ul className="space-y-2 text-sm text-gray-400">
            <li>
              <span className="text-green-400">✓ TTFB 방어:</span> API 연결 직후
              Heartbeat 메시지가 즉시 전송되는지 확인 (이벤트 로그에서 확인)
            </li>
            <li>
              <span className="text-green-400">✓ SSE 스트리밍:</span> 텍스트가
              실시간으로 청크 단위로 출력되는지 확인
            </li>
            <li>
              <span className="text-green-400">✓ 분량 규칙:</span> 생성된 텍스트가
              4,000~6,000자 범위인지 확인
            </li>
            <li>
              <span className="text-green-400">✓ 절단신공:</span> 에피소드 마지막이
              긴장감/기대감으로 끝나는지 확인
            </li>
            <li>
              <span className="text-green-400">✓ 연속성:</span> 테스트 컨텍스트(이청운,
              청풍파)와 일치하는 내용인지 확인
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
