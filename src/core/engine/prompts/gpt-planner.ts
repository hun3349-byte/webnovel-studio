import type { CommercialPlan, PromptArtifacts } from '@/types/generation';
import type { SlidingWindowContext } from '@/types/memory';

export interface BuildGPTPlannerPromptsParams {
  context: SlidingWindowContext;
  userInstruction: string;
  targetEpisodeNumber: number;
}

export function buildGPTPlannerPrompts(
  params: BuildGPTPlannerPromptsParams
): PromptArtifacts {
  const { context, userInstruction, targetEpisodeNumber } = params;

  const systemPrompt = [
    'You are a commercial webnovel planner.',
    'Your job is to design a scene plan for a Korean long-form serial novel.',
    'Do not invent new characters, factions, settings, powers, or lore that are not grounded in the provided context.',
    'Continuity, synopsis compliance, and story bible compliance are absolute priorities.',
    'Return JSON only.',
  ].join('\n');

  const currentSynopsis = context.episodeSynopses?.find(
    (synopsis) => synopsis.isCurrent || synopsis.episodeNumber === targetEpisodeNumber
  );

  const userPrompt = [
    `Target episode: ${targetEpisodeNumber}`,
    `PD instruction: ${userInstruction}`,
    '',
    '[Continuity anchor]',
    context.previousEpisodeEnding || context.lastSceneAnchor || 'No previous ending available.',
    '',
    '[Recent logs]',
    (context.recentLogs || [])
      .slice(0, 3)
      .map((log) => `${log.episodeNumber}: ${log.summary}`)
      .join('\n') || 'None',
    '',
    '[Current synopsis]',
    currentSynopsis?.synopsis || 'No synopsis found.',
    '',
    '[Scene beats]',
    currentSynopsis?.sceneBeats || 'No scene beats found.',
    '',
    '[Active timeline events]',
    (context.activeTimelineEvents || [])
      .map((event) => `${event.eventName}: ${event.mainConflict || ''}`.trim())
      .join('\n') || 'None',
    '',
    '[Characters]',
    (context.activeCharacters || [])
      .map((character) => `${character.name}: ${character.currentLocation || 'unknown location'} / ${character.emotionalState || 'unknown emotion'}`)
      .join('\n'),
    '',
    '[Output JSON schema]',
    JSON.stringify(getCommercialPlanSchema(), null, 2),
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
  };
}

export function parseCommercialPlan(text: string): CommercialPlan {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : text;

  try {
    const parsed = JSON.parse(jsonText) as Partial<CommercialPlan>;
    return {
      openingHook: parsed.openingHook || '',
      scenePlan: Array.isArray(parsed.scenePlan) ? parsed.scenePlan.map((scene, index) => ({
        sceneNumber: typeof scene.sceneNumber === 'number' ? scene.sceneNumber : index + 1,
        purpose: scene.purpose || '',
        conflict: scene.conflict || '',
        turn: scene.turn || '',
        hook: scene.hook || '',
      })) : [],
      microConflicts: Array.isArray(parsed.microConflicts) ? parsed.microConflicts : [],
      endingHook: parsed.endingHook || '',
      dialoguePunch: Array.isArray(parsed.dialoguePunch) ? parsed.dialoguePunch : [],
      continuityChecklist: Array.isArray(parsed.continuityChecklist) ? parsed.continuityChecklist : [],
      synopsisAnchors: Array.isArray(parsed.synopsisAnchors) ? parsed.synopsisAnchors : [],
      rawText: text,
    };
  } catch {
    return {
      openingHook: '',
      scenePlan: [],
      microConflicts: [],
      endingHook: '',
      dialoguePunch: [],
      continuityChecklist: [],
      synopsisAnchors: [],
      rawText: text,
    };
  }
}

function getCommercialPlanSchema() {
  return {
    openingHook: 'string',
    scenePlan: [
      {
        sceneNumber: 1,
        purpose: 'string',
        conflict: 'string',
        turn: 'string',
        hook: 'string',
      },
    ],
    microConflicts: ['string'],
    endingHook: 'string',
    dialoguePunch: ['string'],
    continuityChecklist: ['string'],
    synopsisAnchors: ['string'],
  };
}
