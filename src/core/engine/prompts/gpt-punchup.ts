import type { CommercialPlan, PromptArtifacts } from '@/types/generation';

export interface BuildGPTPunchUpPromptsParams {
  content: string;
  commercialPlan?: CommercialPlan | null;
}

export interface PunchUpSegments {
  opening: string;
  ending: string;
}

export const PUNCHUP_SEGMENT_LENGTH = 300;

export function buildGPTPunchUpPrompts(
  params: BuildGPTPunchUpPromptsParams
): PromptArtifacts {
  const { content, commercialPlan } = params;
  const segments = extractPunchUpSegments(content);

  const systemPrompt = [
    'You are a sentence-level editor for a commercial Korean webnovel.',
    'You are not the writer.',
    'Revise only two local excerpts from the story: the opening and the ending.',
    'Never rewrite the full story.',
    'Do not add new content, new events, new emotion beats, or new tension.',
    'Do not change continuity, canon facts, timeline, character identity, or world rules.',
    'Do not add new characters, settings, factions, or lore.',
    'Preserve paragraph structure, sentence order, and line breaks.',
    'Do not split sentences, add extra line breaks, or turn one sentence into many short lines.',
    'Do not significantly increase or decrease sentence count.',
    'Only smooth awkward phrasing, remove redundancy, improve word choice, and make sentence connections read more naturally.',
    'Keep the amount of change minimal. If a passage is already fine, leave it alone.',
    'Keep the same event order and factual meaning.',
    'Return only the revised excerpts in the exact tagged format below.',
    '[OPENING]',
    '...revised opening excerpt only...',
    '[/OPENING]',
    '[ENDING]',
    '...revised ending excerpt only...',
    '[/ENDING]',
  ].join('\n');

  const userPrompt = [
    '[Role]',
    'You are making the prose read more naturally, not making it louder or more dramatic.',
    '',
    '[Core rules]',
    '- Keep paragraph structure unchanged.',
    '- Keep sentence order unchanged.',
    '- Do not split sentences.',
    '- Do not add line breaks.',
    '- Do not create a chopped webnovel rhythm.',
    '- Do not expand, intensify, or dramatize the content.',
    '- Keep revisions minimal, ideally within 20% of the local excerpt.',
    '',
    '[Allowed edits]',
    '- awkward phrasing -> natural phrasing',
    '- redundant phrasing -> cleaner phrasing',
    '- weak word choice -> more fitting word choice',
    '- rough sentence connection -> smoother connection',
    '',
    '[Forbidden edits]',
    '- new events',
    '- new emotional exaggeration',
    '- artificial hook amplification',
    '- sentence splitting',
    '- structural rewriting',
    '',
    '[Opening guidance]',
    `Target intent: ${commercialPlan?.openingHook || 'Stabilize the first 300 characters without changing structure.'}`,
    '',
    '[Ending guidance]',
    `Target intent: ${commercialPlan?.endingHook || 'Stabilize the last 300 characters without changing structure.'}`,
    '',
    '[Dialogue reference]',
    ...(commercialPlan?.dialoguePunch || ['If dialogue appears in the excerpt, only smooth it without changing intent or rhythm drastically.']).map((item) => `- ${item}`),
    '',
    '[Opening excerpt]',
    segments.opening,
    '',
    '[Ending excerpt]',
    segments.ending,
  ].join('\n');

  return {
    systemPrompt,
    userPrompt,
  };
}

export function extractPunchUpSegments(content: string): PunchUpSegments {
  const opening = content.slice(0, PUNCHUP_SEGMENT_LENGTH);
  const ending = content.length <= PUNCHUP_SEGMENT_LENGTH
    ? content
    : content.slice(-PUNCHUP_SEGMENT_LENGTH);

  return { opening, ending };
}

export function parsePunchUpResponse(text: string): Partial<PunchUpSegments> {
  return {
    opening: extractTaggedBlock(text, 'OPENING'),
    ending: extractTaggedBlock(text, 'ENDING'),
  };
}

export function applyPunchUpSegments(
  content: string,
  revisions: Partial<PunchUpSegments>
): string {
  if (content.length <= PUNCHUP_SEGMENT_LENGTH * 2) {
    return revisions.opening?.trim() || content;
  }

  const openingLength = PUNCHUP_SEGMENT_LENGTH;
  const endingLength = PUNCHUP_SEGMENT_LENGTH;
  const middle = content.slice(openingLength, content.length - endingLength);

  return [
    revisions.opening?.trim() || content.slice(0, openingLength),
    middle,
    revisions.ending?.trim() || content.slice(content.length - endingLength),
  ].join('');
}

function extractTaggedBlock(text: string, tag: 'OPENING' | 'ENDING'): string | undefined {
  const pattern = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, 'i');
  const match = text.match(pattern);
  return match?.[1]?.trim();
}
