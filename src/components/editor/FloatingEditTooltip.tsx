'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FloatingEditTooltipProps {
  selectedText: string;
  selectionRange: { start: number; end: number } | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onRewrite: (instruction: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * 플로팅 부분 수정 툴팁
 * - 텍스트 선택 시 에디터 영역 상단에 플로팅 표시
 * - 빠른 수정 옵션 + 커스텀 지시사항 입력
 * - v8.4 Partial Rewrite API 연동
 */
export function FloatingEditTooltip({
  selectedText,
  selectionRange,
  textareaRef,
  onRewrite,
  disabled = false,
}: FloatingEditTooltipProps) {
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [isRewriting, setIsRewriting] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 선택 영역 위치 계산 - 텍스트 선택 시 textarea 위에 표시
  useEffect(() => {
    if (!selectedText || !selectionRange || !textareaRef.current || disabled) {
      setPosition(null);
      setShowInput(false);
      setInstruction('');
      return;
    }

    const textarea = textareaRef.current;
    const rect = textarea.getBoundingClientRect();

    // 플로팅 메뉴를 textarea 바로 위, 중앙에 표시
    setPosition({
      top: rect.top - 10, // textarea 바로 위
      left: rect.left + rect.width / 2 - 150, // 중앙 정렬 (툴팁 너비의 절반)
    });
  }, [selectedText, selectionRange, textareaRef, disabled]);

  // 입력창 열릴 때 자동 포커스
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  // 빠른 수정 옵션
  const quickOptions = [
    { label: '긴장감 +', instruction: '이 부분을 더 긴장감 있고 몰입도 높게 수정해줘' },
    { label: '묘사 강화', instruction: '이 부분의 묘사를 더 생생하고 구체적으로 강화해줘' },
    { label: '문장 다듬기', instruction: '이 부분의 문장을 더 수려하고 밀도 있게 다듬어줘' },
    { label: '대사 개선', instruction: '이 대사를 캐릭터성이 더 드러나도록 개선해줘' },
  ];

  // 수정 실행
  const handleRewrite = async (customInstruction?: string) => {
    const finalInstruction = customInstruction || instruction;
    if (!finalInstruction.trim()) return;

    setIsRewriting(true);
    try {
      await onRewrite(finalInstruction);
      setShowInput(false);
      setInstruction('');
    } catch (error) {
      console.error('Rewrite failed:', error);
    } finally {
      setIsRewriting(false);
    }
  };

  // Enter 키로 수정 실행
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRewrite();
    }
    if (e.key === 'Escape') {
      setShowInput(false);
      setInstruction('');
    }
  };

  // 선택된 텍스트가 없거나 비활성화된 경우 렌더링하지 않음
  if (!position || !selectedText || disabled) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] bg-gray-800 border border-purple-500/50 rounded-xl shadow-2xl overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '300px',
        maxWidth: '400px',
        transform: 'translateY(-100%)',
        animation: 'floatIn 0.2s ease-out',
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 bg-purple-900/50 border-b border-purple-700/50">
        <div className="flex items-center gap-2">
          <span className="text-purple-300 text-lg">✨</span>
          <span className="text-sm font-semibold text-white">AI 부분 수정</span>
        </div>
        <span className="text-xs text-purple-300 bg-purple-800/50 px-2 py-0.5 rounded">
          {selectedText.length}자 선택
        </span>
      </div>

      {/* 선택된 텍스트 미리보기 */}
      <div className="px-3 py-2 bg-gray-900/50 text-xs text-gray-400 border-b border-gray-700/50">
        <span className="text-purple-400">"</span>
        {selectedText.length > 80 ? selectedText.substring(0, 80) + '...' : selectedText}
        <span className="text-purple-400">"</span>
      </div>

      {!showInput ? (
        /* 빠른 옵션 버튼들 */
        <div className="p-3">
          <div className="flex flex-wrap gap-2 mb-3">
            {quickOptions.map((opt, i) => (
              <button
                key={i}
                onClick={() => handleRewrite(opt.instruction)}
                disabled={isRewriting}
                className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-purple-600 text-gray-200 hover:text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-gray-600 hover:border-purple-500"
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowInput(true)}
            className="w-full px-4 py-2.5 text-sm bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded-lg border border-purple-500/50 transition-all flex items-center justify-center gap-2"
          >
            <span>✏️ 직접 지시하기</span>
          </button>
        </div>
      ) : (
        /* 커스텀 지시사항 입력 */
        <div className="p-3 space-y-3">
          <input
            ref={inputRef}
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="수정 지시사항 입력 후 Enter..."
            disabled={isRewriting}
            className="w-full bg-gray-900 border border-purple-500/50 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex justify-between items-center">
            <button
              onClick={() => {
                setShowInput(false);
                setInstruction('');
              }}
              disabled={isRewriting}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition"
            >
              ← 뒤로
            </button>
            <button
              onClick={() => handleRewrite()}
              disabled={isRewriting || !instruction.trim()}
              className={`px-4 py-1.5 text-sm rounded-lg font-medium transition ${
                isRewriting || !instruction.trim()
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {isRewriting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  수정 중...
                </span>
              ) : (
                'AI 수정 실행'
              )}
            </button>
          </div>
        </div>
      )}

      {/* 로딩 오버레이 */}
      {isRewriting && (
        <div className="absolute inset-0 bg-gray-900/90 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-purple-400/30 border-t-purple-400 rounded-full animate-spin" />
            <span className="text-sm text-purple-300">AI가 수정 중입니다...</span>
          </div>
        </div>
      )}

      {/* 화살표 (아래쪽) */}
      <div
        className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0"
        style={{
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderTop: '8px solid #1f2937',
        }}
      />
    </div>
  );
}

export default FloatingEditTooltip;
