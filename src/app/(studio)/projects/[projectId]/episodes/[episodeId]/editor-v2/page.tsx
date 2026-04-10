'use client';

import { useParams } from 'next/navigation';
import { EpisodeEditorV2 } from '@/components/editor/EpisodeEditorV2';

export default function EpisodeEditorV2Page() {
  const params = useParams();

  return (
    <EpisodeEditorV2
      projectId={params.projectId as string}
      episodeId={params.episodeId as string}
    />
  );
}
