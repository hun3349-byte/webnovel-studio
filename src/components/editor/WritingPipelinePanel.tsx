'use client';

import { GenerationStepCard } from './GenerationStepCard';
import { GenerationTraceDrawer } from './GenerationTraceDrawer';
import { CostAndLatencyBadge } from './CostAndLatencyBadge';
import type { StageProgressEvent } from '@/types/generation';

interface TraceHistoryItem {
  id: string;
  created_at?: string | null;
  generation_mode?: string | null;
  resolved_mode?: string | null;
  status?: string | null;
  trace_payload?: {
    route?: {
      plannerModel?: string | null;
      proseModel?: string | null;
      punchupModel?: string | null;
      fallbackReason?: string;
    };
    stages?: Array<{
      stage: string;
      status: string;
      startedAt?: string;
      completedAt?: string;
    }>;
  } | null;
}

interface WritingPipelinePanelProps {
  steps: StageProgressEvent[];
  generationInfo?: {
    requestedMode?: string;
    resolvedMode?: string;
    plannerModel?: string | null;
    proseModel?: string | null;
    punchupModel?: string | null;
    fallbackReason?: string;
  } | null;
  metrics?: {
    totalLatencyMs?: number;
    estimatedCostUsd?: number;
    actualCostUsd?: number;
  } | null;
  traceId?: string | null;
  traces: TraceHistoryItem[];
}

export function WritingPipelinePanel({
  steps,
  generationInfo,
  metrics,
  traceId,
  traces,
}: WritingPipelinePanelProps) {
  const stepMap = new Map(steps.map((step) => [step.stage, step]));
  const orderedSteps: Array<{ title: string; key: StageProgressEvent['stage'] }> = [
    { title: 'Step 1. GPT Planner', key: 'planner' },
    { title: 'Step 2. Claude Prose', key: 'prose' },
    { title: 'Step 3. GPT Punch-up', key: 'punchup' },
    { title: 'Step 4. Quality Check', key: 'quality' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
        <div className="mb-3 text-sm font-semibold text-white">집필 파이프라인</div>
        <div className="space-y-1 text-xs text-gray-400">
          <div>Requested mode: {generationInfo?.requestedMode || '-'}</div>
          <div>Resolved mode: {generationInfo?.resolvedMode || '-'}</div>
          {generationInfo?.fallbackReason && (
            <div className="text-yellow-300">Fallback: {generationInfo.fallbackReason}</div>
          )}
        </div>
        <div className="mt-3">
          <CostAndLatencyBadge
            costUsd={metrics?.actualCostUsd ?? metrics?.estimatedCostUsd}
            latencyMs={metrics?.totalLatencyMs}
            modelSummary={[
              generationInfo?.plannerModel,
              generationInfo?.proseModel,
              generationInfo?.punchupModel,
            ].filter(Boolean).join(' + ') || null}
          />
        </div>
      </div>

      <div className="space-y-3">
        {orderedSteps.map(({ title, key }) => (
          <GenerationStepCard
            key={key}
            title={title}
            step={stepMap.get(key) || {
              stage: key,
              status: 'pending',
              provider: 'system',
              model: 'pending',
              startedAt: new Date(0).toISOString(),
            }}
          />
        ))}
      </div>

      <GenerationTraceDrawer traceId={traceId} traces={traces} />
    </div>
  );
}
