'use client';

import { CostAndLatencyBadge } from './CostAndLatencyBadge';
import type { StageProgressEvent } from '@/types/generation';

interface GenerationStepCardProps {
  title: string;
  step: StageProgressEvent;
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-gray-800 text-gray-300 border-gray-700',
  running: 'bg-blue-950/70 text-blue-300 border-blue-700',
  completed: 'bg-emerald-950/70 text-emerald-300 border-emerald-700',
  skipped: 'bg-amber-950/70 text-amber-300 border-amber-700',
  failed: 'bg-red-950/70 text-red-300 border-red-700',
};

export function GenerationStepCard({ title, step }: GenerationStepCardProps) {
  const costUsd =
    typeof step.metadata?.estimatedCostUsd === 'number'
      ? step.metadata.estimatedCostUsd
      : undefined;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-gray-500">
            {step.provider} {step.model}
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${STATUS_STYLES[step.status]}`}>
          {step.status}
        </span>
      </div>

      {step.summary && (
        <p className="mb-3 text-xs leading-5 text-gray-300">{step.summary}</p>
      )}

      {step.error && (
        <p className="mb-3 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {step.error}
        </p>
      )}

      <CostAndLatencyBadge
        compact
        costUsd={costUsd}
        latencyMs={step.latencyMs}
        modelSummary={null}
      />
    </div>
  );
}
