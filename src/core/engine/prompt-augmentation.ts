import {
  formatWritingMemoryForPrompt,
  getWritingMemoryContext,
} from '@/core/memory/writing-memory-learner';
import { formatWritingDnaPrompt, getWritingDNA } from '@/core/style/writing-dna';

export interface PromptAugmentationMetadata {
  appliedWritingMemoryIds: string[];
  appliedWritingMemoryCount: number;
  appliedWritingDna: boolean;
  appliedSerialStyle: boolean;
  appliedFirstEpisodeDirective: boolean;
}

export interface AugmentEpisodePromptsParams {
  projectId: string;
  targetEpisodeNumber: number;
  systemPrompt: string;
  userPrompt: string;
}

export interface AugmentEpisodePromptsResult {
  systemPrompt: string;
  userPrompt: string;
  metadata: PromptAugmentationMetadata;
}

const NAVER_SERIAL_STYLE_DIRECTIVE = `
<naver_serial_style>
- 문단은 보통 2~4문장 단위로 묶어라. 한 문장을 여러 단락으로 쪼개지 마라.
- 같은 행동 흐름, 같은 시선, 같은 감정선은 한 문단 안에서 자연스럽게 이어라.
- 대사만 덜렁 한 줄로 남기지 말고, 가능하면 직전 동작이나 직후 반응을 같은 문단에 붙여라.
- 짧은 문단을 남발하지 말고, 장면 전환이나 시점 이동이 있을 때만 문단을 나눠라.
- 모바일 연재 화면에서 읽히는 호흡을 유지하되, 시처럼 잘게 끊긴 문단은 피하라.
</naver_serial_style>
`;

const FIRST_EPISODE_DIRECTIVE = `
<first_episode_directive>
- 1화는 첫 300자 안에 감각적 충격이나 이상 징후를 드러내라.
- 1,200자 안에는 주인공의 결핍, 처지, 생존 방식을 행동으로 보여줘라.
- 2,000자 안에는 세계의 규칙이나 위험의 실체를 독자가 감지하게 만들어라.
- 최소 4개 장면으로 구성하고, 각 장면은 800자 이상 확보해 총 4,000자 이상으로 끌고 가라.
- 마지막 600자 안에는 위기, 발견, 선언, 반전 중 하나를 배치해 다음 화 클릭을 강제하라.
</first_episode_directive>
`;

export async function augmentEpisodePrompts(
  params: AugmentEpisodePromptsParams
): Promise<AugmentEpisodePromptsResult> {
  const {
    projectId,
    targetEpisodeNumber,
    systemPrompt: baseSystemPrompt,
    userPrompt: baseUserPrompt,
  } = params;

  let systemPrompt = baseSystemPrompt;
  let userPrompt = `${baseUserPrompt}\n${NAVER_SERIAL_STYLE_DIRECTIVE}`;
  const appliedWritingMemoryIds: string[] = [];
  let appliedWritingDna = false;
  const appliedFirstEpisodeDirective = targetEpisodeNumber === 1;

  if (appliedFirstEpisodeDirective) {
    userPrompt = `${userPrompt}\n${FIRST_EPISODE_DIRECTIVE}`;
  }

  try {
    const writingMemoryContext = await getWritingMemoryContext(projectId);
    const writingMemoryPrompt = formatWritingMemoryForPrompt(writingMemoryContext);

    if (writingMemoryPrompt) {
      systemPrompt = `${systemPrompt}\n${writingMemoryPrompt}`;
      appliedWritingMemoryIds.push(...writingMemoryContext.memoryIds);
    }
  } catch (error) {
    console.warn('[PromptAugmentation] Failed to inject writing memory prompt:', error);
  }

  try {
    const writingDna = await getWritingDNA(projectId);
    const writingDnaPrompt = formatWritingDnaPrompt(writingDna);

    if (writingDnaPrompt) {
      systemPrompt = `${systemPrompt}\n${writingDnaPrompt}`;
      appliedWritingDna = true;
    }
  } catch (error) {
    console.warn('[PromptAugmentation] Failed to inject writing DNA prompt:', error);
  }

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      appliedWritingMemoryIds,
      appliedWritingMemoryCount: appliedWritingMemoryIds.length,
      appliedWritingDna,
      appliedSerialStyle: true,
      appliedFirstEpisodeDirective,
    },
  };
}
