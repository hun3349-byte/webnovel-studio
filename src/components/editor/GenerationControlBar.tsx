'use client';

import { CostAndLatencyBadge } from './CostAndLatencyBadge';
import type { GenerationMode } from '@/types/generation';

interface GenerationControlBarProps {
  generationMode: GenerationMode;
  plannerEnabled: boolean;
  punchupEnabled: boolean;
  compareModes: boolean;
  useMock: boolean;
  generating: boolean;
  compareLoading: boolean;
  controlsDisabled?: boolean;
  actionDisabled?: boolean;
  currentStageLabel?: string | null;
  expectedCostUsd?: number | null;
  actualCostUsd?: number | null;
  totalLatencyMs?: number | null;
  expectedModelSummary?: string | null;
  actualModelSummary?: string | null;
  fallbackReason?: string | null;
  onGenerationModeChange: (mode: GenerationMode) => void;
  onPlannerToggle: (enabled: boolean) => void;
  onPunchupToggle: (enabled: boolean) => void;
  onCompareModesChange: (enabled: boolean) => void;
  onUseMockChange: (enabled: boolean) => void;
  onGenerate: () => void;
  onCompare: () => void;
  onStop: () => void;
}

export function GenerationControlBar({
  generationMode,
  plannerEnabled,
  punchupEnabled,
  compareModes,
  useMock,
  generating,
  compareLoading,
  controlsDisabled = false,
  actionDisabled = false,
  currentStageLabel,
  expectedCostUsd,
  actualCostUsd,
  totalLatencyMs,
  expectedModelSummary,
  actualModelSummary,
  fallbackReason,
  onGenerationModeChange,
  onPlannerToggle,
  onPunchupToggle,
  onCompareModesChange,
  onUseMockChange,
  onGenerate,
  onCompare,
  onStop,
}: GenerationControlBarProps) {
  const controlsLocked = controlsDisabled || generating;
  const actionsLocked = actionDisabled || generating;

  return (
    <div className="border-b border-gray-800 bg-gradient-to-r from-gray-900 via-gray-950 to-gray-900 px-6 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
              Writing Workbench
            </div>
            <div className="mt-1 text-sm text-gray-400">
              이번 화를 어떤 파이프라인으로 집필할지 정한 뒤 바로 실행하고 비교할 수 있습니다.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={generationMode}
              onChange={(event) => onGenerationModeChange(event.target.value as GenerationMode)}
              disabled={controlsLocked}
              className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="claude_legacy">Claude Legacy</option>
              <option value="hybrid_gpt_claude">Hybrid</option>
              <option value="hybrid_gpt_claude_punchup">Hybrid + Punch-up (실험)</option>
            </select>

            <ToggleChip
              label="Planner"
              checked={plannerEnabled}
              disabled={controlsLocked}
              onChange={onPlannerToggle}
            />
            <ToggleChip
              label="Punch-up"
              checked={punchupEnabled}
              disabled={controlsLocked || !plannerEnabled}
              onChange={onPunchupToggle}
            />
            <ToggleChip
              label="Compare"
              checked={compareModes}
              disabled={controlsLocked}
              onChange={onCompareModesChange}
            />
            <ToggleChip
              label="Mock"
              checked={useMock}
              disabled={controlsLocked}
              onChange={onUseMockChange}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CostAndLatencyBadge
              costUsd={actualCostUsd ?? expectedCostUsd}
              latencyMs={totalLatencyMs}
              modelSummary={actualModelSummary || expectedModelSummary || null}
            />
            {currentStageLabel && (
              <span className="rounded-full border border-blue-800/60 bg-blue-950/40 px-3 py-1.5 text-xs text-blue-300">
                {currentStageLabel}
              </span>
            )}
            {fallbackReason && (
              <span className="rounded-full border border-yellow-800/60 bg-yellow-950/40 px-3 py-1.5 text-xs text-yellow-300">
                {fallbackReason}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {!generating ? (
            <>
              <button
                type="button"
                onClick={onCompare}
                disabled={actionDisabled || compareLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  actionDisabled || compareLoading
                    ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                {compareLoading ? '비교 생성중...' : '비교 생성'}
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={actionsLocked}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  actionsLocked
                    ? 'cursor-not-allowed bg-gray-800 text-gray-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                집필 시작
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              집필 중단
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleChip({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
        disabled
          ? 'border-gray-800 bg-gray-950 text-gray-600'
          : checked
            ? 'border-blue-700 bg-blue-950/50 text-blue-300'
            : 'border-gray-700 bg-gray-900 text-gray-300'
      }`}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-950 text-blue-500"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
