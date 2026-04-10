'use client';

import { CostAndLatencyBadge } from './CostAndLatencyBadge';
import type { CompareCandidateResult } from '@/types/generation';

interface CompareSummaryCardsProps {
  candidates: CompareCandidateResult[];
  blindMode: boolean;
  selectedId?: string | null;
  preferredId?: string | null;
  onSelect: (id: string) => void;
  onPrefer: (id: string) => void;
  onToggleBlindMode: () => void;
}

export function CompareSummaryCards({
  candidates,
  blindMode,
  selectedId,
  preferredId,
  onSelect,
  onPrefer,
  onToggleBlindMode,
}: CompareSummaryCardsProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">비교 요약 카드</div>
          <div className="mt-1 text-xs text-gray-500">
            긴 본문 전체 비교 대신 opening, ending, 대표 대사를 우선 판단합니다.
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleBlindMode}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-300 transition hover:border-gray-600 hover:text-white"
        >
          {blindMode ? '블라인드 해제' : '블라인드 모드'}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {candidates.map((candidate) => {
          const isSelected = selectedId === candidate.id;
          const isPreferred = preferredId === candidate.id;

          return (
            <div
              key={candidate.id}
              className={`rounded-xl border p-4 transition ${
                isSelected
                  ? 'border-blue-500 bg-blue-950/20'
                  : 'border-gray-800 bg-gray-950/60'
              }`}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">
                    {blindMode ? `Version ${candidate.blindedLabel}` : candidate.label}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {blindMode ? 'mode hidden' : candidate.mode}
                  </div>
                </div>
                {isPreferred && (
                  <span className="rounded-full border border-emerald-700 bg-emerald-950/60 px-2 py-1 text-[11px] text-emerald-300">
                    selected
                  </span>
                )}
              </div>

              <div className="mb-3 space-y-1 text-xs text-gray-300">
                <div>Char count: {candidate.charCount.toLocaleString()}</div>
                <div>Validator: {candidate.validatorScore ?? '-'}</div>
                <div>Opening: {candidate.openingScore ?? '-'}</div>
                <div>Ending: {candidate.endingScore ?? '-'}</div>
              </div>

              <CostAndLatencyBadge
                compact
                costUsd={candidate.estimatedCostUsd}
                latencyMs={candidate.latencyMs}
                modelSummary={blindMode ? null : candidate.modelSummary || null}
              />

              {candidate.fallbackReason && !blindMode && (
                <div className="mt-3 rounded-lg border border-yellow-800/50 bg-yellow-950/30 px-3 py-2 text-[11px] text-yellow-300">
                  {candidate.fallbackReason}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => onSelect(candidate.id)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  비교 보기
                </button>
                <button
                  type="button"
                  onClick={() => onPrefer(candidate.id)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
                    isPreferred
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  선택
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
