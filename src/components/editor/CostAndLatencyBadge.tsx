'use client';

interface CostAndLatencyBadgeProps {
  costUsd?: number | null;
  latencyMs?: number | null;
  modelSummary?: string | null;
  compact?: boolean;
}

export function CostAndLatencyBadge({
  costUsd,
  latencyMs,
  modelSummary,
  compact = false,
}: CostAndLatencyBadgeProps) {
  const costLabel =
    typeof costUsd === 'number' ? `~$${costUsd.toFixed(3)}` : 'n/a';
  const latencyLabel =
    typeof latencyMs === 'number' ? `${(latencyMs / 1000).toFixed(1)}s` : 'n/a';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <span className="rounded-full border border-emerald-800/60 bg-emerald-950/50 px-2 py-1 text-emerald-300">
        Cost {costLabel}
      </span>
      <span className="rounded-full border border-cyan-800/60 bg-cyan-950/50 px-2 py-1 text-cyan-300">
        Latency {latencyLabel}
      </span>
      {modelSummary && (
        <span className="rounded-full border border-gray-700 bg-gray-900/70 px-2 py-1 text-gray-300">
          {modelSummary}
        </span>
      )}
    </div>
  );
}
