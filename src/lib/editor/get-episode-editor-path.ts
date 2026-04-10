export function getEpisodeEditorPath(projectId: string, episodeId: string): string {
  const flag = process.env.NEXT_PUBLIC_EPISODE_EDITOR_V2;
  const useEditorV2 = flag !== 'false';

  if (useEditorV2) {
    return `/projects/${projectId}/episodes/${episodeId}/editor-v2`;
  }

  return `/projects/${projectId}/episodes/${episodeId}`;
}
