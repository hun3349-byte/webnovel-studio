import { buildEpisodeGenerationPrompts } from '@/core/engine/prompt-injector';
import { augmentEpisodePrompts } from '@/core/engine/prompt-augmentation';
import type {
  CommercialPlan,
  PromptArtifacts,
  PromptMetadata,
} from '@/types/generation';
import type { SlidingWindowContext } from '@/types/memory';

export interface BuildClaudeProsePromptsParams {
  context: SlidingWindowContext;
  userInstruction: string;
  targetEpisodeNumber: number;
  projectId: string;
  commercialPlan?: CommercialPlan | null;
}

export interface ClaudeProsePromptBuildResult extends PromptArtifacts {
  metadata: PromptMetadata;
}

export async function buildClaudeProsePrompts(
  params: BuildClaudeProsePromptsParams
): Promise<ClaudeProsePromptBuildResult> {
  const {
    context,
    userInstruction,
    targetEpisodeNumber,
    projectId,
  } = params;

  const {
    systemPrompt: baseSystemPrompt,
    userPrompt: baseUserPrompt,
  } = await buildEpisodeGenerationPrompts(
    context,
    userInstruction,
    targetEpisodeNumber,
    projectId
  );

  const augmented = await augmentEpisodePrompts({
    projectId,
    targetEpisodeNumber,
    systemPrompt: baseSystemPrompt,
    userPrompt: baseUserPrompt,
  });

  return {
    systemPrompt: augmented.systemPrompt,
    userPrompt: augmented.userPrompt,
    metadata: augmented.metadata as PromptMetadata,
  };
}
