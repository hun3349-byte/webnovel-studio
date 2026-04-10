'use client';

import { useState } from 'react';

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

interface GenerationTraceDrawerProps {
  traceId?: string | null;
  traces: TraceHistoryItem[];
}

export function GenerationTraceDrawer({
  traceId,
  traces,
}: GenerationTraceDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <div className="text-sm font-semibold text-white">생성 이력 / Trace</div>
          <div className="mt-1 text-xs text-gray-500">
            현재 Trace ID: {traceId || '없음'}
          </div>
        </div>
        <span className="text-xs text-gray-400">{open ? '닫기' : '열기'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-800 px-4 py-3">
          {traces.length === 0 ? (
            <div className="text-xs text-gray-500">아직 저장된 생성 이력이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {traces.map((trace) => (
                <div key={trace.id} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3 text-xs text-gray-300">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-white">{trace.id}</div>
                    <div className="text-gray-500">{trace.created_at || '-'}</div>
                  </div>
                  <div className="mt-2 space-y-1 text-gray-400">
                    <div>Mode: {trace.generation_mode || '-'} / {trace.resolved_mode || '-'}</div>
                    <div>Status: {trace.status || '-'}</div>
                    <div>
                      Models: {[
                        trace.trace_payload?.route?.plannerModel,
                        trace.trace_payload?.route?.proseModel,
                        trace.trace_payload?.route?.punchupModel,
                      ].filter(Boolean).join(' + ') || '-'}
                    </div>
                    {trace.trace_payload?.route?.fallbackReason && (
                      <div className="text-yellow-300">Fallback: {trace.trace_payload.route.fallbackReason}</div>
                    )}
                  </div>
                  {trace.trace_payload?.stages?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trace.trace_payload.stages.map((stage) => (
                        <span
                          key={`${trace.id}-${stage.stage}`}
                          className="rounded-full border border-gray-700 bg-gray-900 px-2 py-1 text-[11px] text-gray-300"
                        >
                          {stage.stage}: {stage.status}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
