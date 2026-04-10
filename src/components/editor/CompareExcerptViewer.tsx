'use client';

import type { CompareCandidateResult } from '@/types/generation';

interface CompareExcerptViewerProps {
  candidates: CompareCandidateResult[];
  blindMode: boolean;
  selectedId?: string | null;
}

export function CompareExcerptViewer({
  candidates,
  blindMode,
  selectedId,
}: CompareExcerptViewerProps) {
  const visibleCandidates = selectedId
    ? candidates.filter((candidate) => candidate.id === selectedId)
    : candidates;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-4">
      <div className="mb-4">
        <div className="text-sm font-semibold text-white">핵심 구간 비교</div>
        <div className="mt-1 text-xs text-gray-500">
          opening 300~500자, ending 300~500자, 대표 대사 1~2개 중심으로 비교합니다.
        </div>
      </div>

      <div className="space-y-4">
        <ExcerptSection
          title="Opening"
          candidates={visibleCandidates}
          blindMode={blindMode}
          getValue={(candidate) => candidate.excerpts.opening}
        />
        <ExcerptSection
          title="Ending"
          candidates={visibleCandidates}
          blindMode={blindMode}
          getValue={(candidate) => candidate.excerpts.ending}
        />
        <ExcerptSection
          title="Dialogue"
          candidates={visibleCandidates}
          blindMode={blindMode}
          getValue={(candidate) => candidate.excerpts.dialogue.join('\n\n') || '대표 대사가 추출되지 않았습니다.'}
        />
      </div>
    </div>
  );
}

function ExcerptSection({
  title,
  candidates,
  blindMode,
  getValue,
}: {
  title: string;
  candidates: CompareCandidateResult[];
  blindMode: boolean;
  getValue: (candidate: CompareCandidateResult) => string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
        {title}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {candidates.map((candidate) => (
          <div key={`${candidate.id}-${title}`} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
            <div className="mb-2 text-xs font-medium text-gray-300">
              {blindMode ? `Version ${candidate.blindedLabel}` : candidate.label}
            </div>
            <div className="text-xs leading-6 text-gray-400 whitespace-pre-wrap">
              {getValue(candidate)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
