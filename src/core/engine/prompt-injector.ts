import type { ActiveCharacter, SlidingWindowContext } from '@/types/memory';

const WRITER_PERSONA = `
<writer_persona>
너는 대한민국 최고의 상업 웹소설 작가(하드보일드/다크 판타지 특화)다.
너의 문장은 차갑고 건조하지만 몰입감이 높다.
너는 이야기를 지어내는 사람이 아니라, 이미 일어난 사건 기록(세계관/캐릭터/시놉시스)을 관찰해 소설로 각색하는 사람이다.
기획자(사용자)가 제공한 설계도(시놉시스)에 100% 복종하며, 없는 사건이나 인물을 창조하는 순간 실패다.
</writer_persona>
`.trim();

const CORE_CONSTITUTION = `
<core_constitution>
[Rule 1: Story Bible Absolute Priority]
- 사용자 시놉시스/세계관/캐릭터가 절대 기준이다.
- 사전학습 지식(실제 역사/클리셰) 개입 금지.
- 시놉시스에 없는 핵심 인물/배경/사건 임의 창조 금지.

[Rule 2: Continuity via Memory Log]
- 직전 회차 핵심 포인트, 떡밥, 흐름을 반드시 이어라.
- 시간선/감정선/사건선이 끊기면 실패다.

[Rule 3: Organic Character Handling]
- 사용자 캐릭터 DB를 최우선 사용.
- 엑스트라가 필요하면 기존 세계관 톤을 해치지 않는 최소 범위에서만 자연스럽게 사용.

[Rule 4: No Staccato]
- 짧은 단문을 여러 단락으로 쪼개는 스타카토 문체 금지.
- 연결되는 행동과 감각은 긴 호흡의 자연스러운 문장으로 이어라.

[Rule 5: Show, Don't Tell]
- 감정/배경/성격을 해설하지 마라.
- 행동, 표정, 대사, 감각 묘사로 보여줘라.
</core_constitution>
`.trim();

const OUTPUT_CONTRACT = `
<output_contract>
- 순수 본문만 출력한다.
- 마크다운, 메타 설명, 계획표 출력 금지.
- 분량은 공백 포함 4,000~6,000자를 목표로 한다.
- 마지막 문단은 다음 화 궁금증을 남기는 후킹으로 마무리한다.
</output_contract>
`.trim();

const CAUSALITY_CONSTITUTION = `
<causality_constitution>
[Atomization Rule]
- 사건을 A(상황/배경) -> B(발견/인지) -> C(행동/결과)로 분해해 서술한다.
- A/B/C 각 단계에 심리, 감각, 결과 중 최소 2개 이상을 포함한다.
- "결론 점프" 금지: A에서 바로 C로 건너뛰지 않는다.

[Trigger Rule]
- 각 문단은 다음 문단을 유발하는 트리거를 포함해야 한다.
- "A가 일어났기 때문에 B를 느끼고, 그 느낌 때문에 C를 행동했다" 인과를 보이게 작성한다.
- 트리거 없는 장면 전환/설명 덩어리 금지.

[Reaction Rule]
- 주요 사건에는 캐릭터 고유 리액션을 반드시 삽입한다.
- 리액션은 캐릭터 성격/말투 DB와 일치해야 하며, 캐릭터 간 충돌/캐미를 드러내야 한다.
</causality_constitution>
`.trim();

const STAGED_NARRATIVE_EXPANSION_GUIDE = `
<staged_narrative_expansion_and_character_chemistry>
[Rule 1: Anti-Compression Protocol]
- 절대 결론부터 쓰지 마라. 사건은 반드시 단계적으로 전개한다.
- 각 핵심 사건마다 아래 3단계를 모두 거친다:
  1) 발단(감각과 인지): 시각/청각/후각 등 감각 단서를 최소 2문장 이상.
  2) 심화(내부 필터링): 주인공의 직업적 본능/가치관으로 해석하는 독백.
  3) 결과(행동과 반작용): 행동 + 상대가 받는 충격/오해를 구체 묘사.
- A/B/C를 한 문장으로 압축 금지.

[Rule 2: Reaction-Driven Chemistry]
- 주인공의 행동(Action) 뒤에는 조연의 리액션(Reaction)을 반드시 붙여라.
- 리액션은 캐릭터 DB의 성격/말투와 충돌하도록 구성하라.
- 주인공의 현대적 표현(예: KPI, 재고, 마진 등)은 조연이 세계관 용어로 오해하는 과정을 묘사하라.
- "알겠다" 식 단순 응답 금지. 당황/경악/의심/경외 중 최소 1개를 행동으로 보여줘라.

[Rule 3: Trigger Logic]
- 사건 B는 반드시 사건 A의 트리거에서 파생되어야 한다. 우연으로 덮지 마라.
- 위기 해결 장면은 "기억 복기 -> 정보 대조 -> 논리 유추 -> 행동 결정" 과정을 최소 6문장 이상.
- 새 아이템/세력 등장 시, 이전 회차 언급(복선)과의 연결 고리를 본문에 명시하라.

[Rule 4: Showing Priority]
- 감정 직접 서술 금지어: 피곤했다, 놀랐다, 기뻤다, 사랑했다.
- 감정은 신체 변화, 호흡, 시선, 미세 동작으로 대체하라.
</staged_narrative_expansion_and_character_chemistry>
`.trim();

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function resolveCurrentEpisodeSynopsis(
  context: SlidingWindowContext,
  targetEpisodeNumber: number
) {
  return (
    context.episodeSynopses?.find((synopsis) => synopsis.isCurrent) ??
    context.episodeSynopses?.find((synopsis) => synopsis.episodeNumber === targetEpisodeNumber)
  );
}

function buildStoryBibleOverrideSection(
  context: SlidingWindowContext,
  targetEpisodeNumber: number
): string {
  const currentSynopsis = resolveCurrentEpisodeSynopsis(context, targetEpisodeNumber);
  const warning =
    '경고: 너의 사전 학습 지식(실제 역사, 클리셰 등)보다 아래 제공된 [스토리 바이블]이 무조건 우선한다. 시놉시스에 없는 인물, 시대적 배경을 임의로 창조하면 즉시 생성 실패로 간주한다.';

  if (!currentSynopsis) {
    return [
      '<story_bible_override>',
      warning,
      '[current_episode_synopsis]',
      '현재 회차 시놉시스가 비어 있다. 기존 세계관/캐릭터/PD 지시사항만 사용해 작성하라.',
      '</story_bible_override>',
    ].join('\n');
  }

  const lines: string[] = [
    '<story_bible_override>',
    warning,
    `episode_number: ${currentSynopsis.episodeNumber}`,
  ];

  if (currentSynopsis.title) {
    lines.push(`title: ${currentSynopsis.title}`);
  }

  lines.push('[current_episode_synopsis]');
  lines.push(currentSynopsis.synopsis);

  if (currentSynopsis.keyEvents?.length) {
    lines.push('[key_events]');
    currentSynopsis.keyEvents.forEach((event, index) => {
      lines.push(`${index + 1}. ${event}`);
    });
  }

  if (currentSynopsis.foreshadowing?.length) {
    lines.push('[foreshadowing]');
    currentSynopsis.foreshadowing.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (currentSynopsis.callbacks?.length) {
    lines.push('[callbacks]');
    currentSynopsis.callbacks.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (currentSynopsis.forbidden) {
    lines.push('[forbidden]');
    lines.push(currentSynopsis.forbidden);
  }

  lines.push('</story_bible_override>');
  return lines.join('\n');
}

export function buildMemoryLogSection(context: SlidingWindowContext): string {
  const recentLogs = context.recentLogs
    .slice(0, 5)
    .map((log) => `- ${log.episodeNumber}화: ${log.summary}`)
    .join('\n');

  const unresolvedHooks = context.unresolvedHooks
    .slice(0, 8)
    .map((hook) => `- [중요도 ${hook.importance}] ${hook.summary}`)
    .join('\n');

  return [
    '<memory_log>',
    '[recent_episode_flow]',
    recentLogs || '- 없음',
    '[unresolved_hooks]',
    unresolvedHooks || '- 없음',
    '</memory_log>',
  ].join('\n');
}

function scoreHookForEpisode(
  hook: { importance: number; createdInEpisodeNumber: number },
  targetEpisodeNumber: number
): number {
  const distance = Math.max(0, targetEpisodeNumber - hook.createdInEpisodeNumber);
  return hook.importance * 100 - distance * 5 + hook.createdInEpisodeNumber * 0.01;
}

function buildDynamicMemoryLogSection(
  context: SlidingWindowContext,
  targetEpisodeNumber: number
): string {
  const currentSynopsis = resolveCurrentEpisodeSynopsis(context, targetEpisodeNumber);

  const recentLogs = context.recentLogs
    .slice(0, 5)
    .map((log) => `- ${log.episodeNumber}?? ${log.summary}`)
    .join('\n');

  const unresolvedHooks = [...context.unresolvedHooks]
    .sort(
      (a, b) =>
        scoreHookForEpisode(b, targetEpisodeNumber) -
        scoreHookForEpisode(a, targetEpisodeNumber)
    )
    .slice(0, 8)
    .map(
      (hook) =>
        `- [created:${hook.createdInEpisodeNumber} | importance:${hook.importance}] ${hook.summary}`
    )
    .join('\n');

  const foreshadowingFocus = toStringList(currentSynopsis?.foreshadowing)
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');

  const callbackFocus = toStringList(currentSynopsis?.callbacks)
    .slice(0, 6)
    .map((item, index) => `${index + 1}. ${item}`)
    .join('\n');

  return [
    '<memory_log>',
    '[recent_episode_flow]',
    recentLogs || '- ?놁쓬',
    '[unresolved_hooks]',
    unresolvedHooks || '- ?놁쓬',
    '[episode_hook_focus.foreshadowing]',
    foreshadowingFocus || '- ?놁쓬',
    '[episode_hook_focus.callbacks]',
    callbackFocus || '- ?놁쓬',
    '</memory_log>',
  ].join('\n');
}

export function buildCompactCharacterSection(characters: ActiveCharacter[]): string {
  if (!characters?.length) {
    return '<characters>\n- 등록된 캐릭터 없음\n</characters>';
  }

  const lines = characters
    .slice(0, 20)
    .map((character) => {
      const role = character.role || 'unknown';
      const location = character.currentLocation || '미상';
      const emotion = character.emotionalState || '미상';
      const speech = character.speechPattern ? ` | 말투:${character.speechPattern}` : '';
      return `- ${character.name} [${role}] | 위치:${location} | 감정:${emotion}${speech}`;
    })
    .join('\n');

  return `<characters>\n${lines}\n</characters>`;
}

export function buildCompactWorldSection(worldBible: SlidingWindowContext['worldBible']): string {
  if (!worldBible) {
    return '<world_bible>\n- 세계관 정보 없음\n</world_bible>';
  }

  const absoluteRules = toStringList(
    (worldBible as { absolute_rules?: unknown }).absolute_rules
  ).slice(0, 10);
  const forbidden = toStringList(
    (worldBible as { forbidden_elements?: unknown }).forbidden_elements
  ).slice(0, 10);

  const lines: string[] = ['<world_bible>'];
  lines.push(`- world_name: ${(worldBible as { world_name?: string | null }).world_name || '미설정'}`);
  lines.push(`- time_period: ${(worldBible as { time_period?: string | null }).time_period || '미설정'}`);
  lines.push(
    `- power_system: ${(worldBible as { power_system_name?: string | null }).power_system_name || '미설정'}`
  );
  lines.push('[absolute_rules]');
  lines.push(...(absoluteRules.length ? absoluteRules.map((rule) => `- ${rule}`) : ['- 없음']));
  lines.push('[forbidden_elements]');
  lines.push(...(forbidden.length ? forbidden.map((item) => `- ${item}`) : ['- 없음']));
  lines.push('</world_bible>');
  return lines.join('\n');
}

export function buildSynopsisSection(
  context: SlidingWindowContext,
  targetEpisodeNumber?: number
): string {
  const currentSynopsis = targetEpisodeNumber
    ? resolveCurrentEpisodeSynopsis(context, targetEpisodeNumber)
    : context.episodeSynopses?.find((synopsis) => synopsis.isCurrent);

  if (!currentSynopsis) {
    return [
      '<episode_synopsis>',
      '- 현재 회차 시놉시스 없음',
      '</episode_synopsis>',
    ].join('\n');
  }

  const lines: string[] = [`<episode_synopsis episode="${currentSynopsis.episodeNumber}">`];

  if (currentSynopsis.title) {
    lines.push(`title: ${currentSynopsis.title}`);
  }
  lines.push('synopsis:');
  lines.push(currentSynopsis.synopsis);

  if (currentSynopsis.goals?.length) {
    lines.push('goals:');
    currentSynopsis.goals.forEach((goal, index) => {
      lines.push(`${index + 1}. ${goal}`);
    });
  }

  if (currentSynopsis.keyEvents?.length) {
    lines.push('key_events:');
    currentSynopsis.keyEvents.forEach((event, index) => {
      lines.push(`${index + 1}. ${event}`);
    });
  }

  if (currentSynopsis.foreshadowing?.length) {
    lines.push('foreshadowing:');
    currentSynopsis.foreshadowing.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (currentSynopsis.callbacks?.length) {
    lines.push('callbacks:');
    currentSynopsis.callbacks.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (currentSynopsis.sceneBeats) {
    lines.push('scene_beats:');
    lines.push(currentSynopsis.sceneBeats);
  }

  if (currentSynopsis.forbidden) {
    lines.push('forbidden:');
    lines.push(currentSynopsis.forbidden);
  }

  lines.push('</episode_synopsis>');
  return lines.join('\n');
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

export function buildEpisodeCharacterGateSection(
  context: SlidingWindowContext,
  targetEpisodeNumber: number
): string {
  const currentSynopsis = resolveCurrentEpisodeSynopsis(context, targetEpisodeNumber);
  const allowed = toStringList(currentSynopsis?.featuredCharacters)
    .map(normalizeName)
    .filter(Boolean);

  if (!allowed.length) {
    return '';
  }

  const strictEpisodeOpening = targetEpisodeNumber <= 2;

  const lines: string[] = ['<episode_character_gate>'];
  lines.push(`episode: ${targetEpisodeNumber}`);
  lines.push('[allowed_characters]');
  allowed.forEach((name, index) => {
    lines.push(`${index + 1}. ${name}`);
  });
  lines.push('[hard_rules]');
  lines.push('- Only allowed characters may appear with direct action or dialogue in this episode.');
  lines.push('- Do not physically 등장시키다 any out-of-list named character.');
  lines.push('- If mention is unavoidable, keep it as rumor/background reference only.');
  if (strictEpisodeOpening) {
    lines.push('- Episode opening phase must be extra strict: no cameo entry outside allowed list.');
  }
  lines.push('</episode_character_gate>');
  return lines.join('\n');
}

export function buildPreviousEndingSection(context: SlidingWindowContext): string {
  const ending =
    context.previousEpisodeEnding?.trim() ||
    context.recentLogs[0]?.last500Chars?.trim() ||
    '';

  if (!ending) return '';

  return [
    '<previous_ending>',
    '[직전 화 마지막 장면]',
    ending.slice(-900),
    '</previous_ending>',
  ].join('\n');
}

export function buildPreviousSummarySection(context: SlidingWindowContext): string {
  const previous = context.recentLogs[0];
  if (!previous) return '';

  return [
    '<previous_summary>',
    `${previous.episodeNumber}화 요약: ${previous.summary.slice(0, 280)}`,
    '</previous_summary>',
  ].join('\n');
}

export function buildTransitionContractSection(context: SlidingWindowContext): string {
  const contract = context.transitionContract;
  if (!contract) return '';

  return [
    '<transition_contract>',
    `source_episode: ${contract.sourceEpisodeNumber}`,
    `target_episode: ${contract.targetEpisodeNumber}`,
    '[anchor_1]',
    contract.anchor1 || '-',
    '[anchor_2]',
    contract.anchor2 || '-',
    '[anchor_3]',
    contract.anchor3 || '-',
    '[opening_guardrail]',
    contract.openingGuardrail || '직전 화 마지막 장면의 장소/감정/행동 결과를 즉시 이어라.',
    '</transition_contract>',
  ].join('\n');
}

export function buildCharacterSnapshotSection(context: SlidingWindowContext): string {
  const snapshots = context.previousCharacterSnapshots || [];
  if (!snapshots.length) return '';

  const rows = snapshots
    .slice(0, 12)
    .map(
      (item) =>
        `- ${item.name} | role:${item.role || 'unknown'} | location:${item.location || 'unknown'} | emotion:${item.emotionalState || 'unknown'}`
    )
    .join('\n');

  return [
    '<previous_character_snapshots>',
    rows,
    '</previous_character_snapshots>',
  ].join('\n');
}

export function buildCausalityContractSection(): string {
  return [
    '<causal_scene_contract>',
    '각 핵심 사건은 최소 3문장 이상으로 전개한다.',
    '문장 구조: A(상황) -> Trigger -> B(인지/감각/독백) -> Trigger -> C(행동/결과).',
    'A/B/C를 한 문장으로 뭉개지 말고, 각 단계 사이 인과를 분명하게 드러낸다.',
    '중요: 사건을 요약하지 말고, 단계별 징검다리를 모두 밟아라.',
    '[anti_compression_protocol]',
    '핵심 사건은 발단(감각) -> 심화(내적 해석) -> 결과(행동+반작용) 3단계를 반드시 거쳐라.',
    'A/B/C를 한 문장으로 압축하지 마라.',
    '[reaction_rule]',
    '주인공 행동 뒤에는 상대의 오해/경악/의심 리액션을 붙여 캐릭터 케미를 만든다.',
    '[trigger_rule]',
    '다음 문단은 반드시 직전 문단의 트리거로 이어져야 하며, 우연 전개를 금지한다.',
    '</causal_scene_contract>',
  ].join('\n');
}

export async function buildSystemPromptV9(
  targetEpisodeNumber: number,
  _projectId?: string
): Promise<string> {
  const continuityRule =
    targetEpisodeNumber > 1
      ? '<continuity_rule>\n직전 화 감정선과 사건선을 바로 이어서 시작한다.\n</continuity_rule>'
      : '';

  return [WRITER_PERSONA, CORE_CONSTITUTION, continuityRule, OUTPUT_CONTRACT]
    .concat(CAUSALITY_CONSTITUTION, STAGED_NARRATIVE_EXPANSION_GUIDE)
    .filter(Boolean)
    .join('\n\n');
}

export function buildUserPromptV9(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): string {
  const sections: string[] = [];
  sections.push(buildStoryBibleOverrideSection(context, targetEpisodeNumber));

  if (targetEpisodeNumber > 1) {
    const previousEnding = buildPreviousEndingSection(context);
    if (previousEnding) sections.push(previousEnding);
  }
  sections.push(buildTransitionContractSection(context));
  sections.push(buildCharacterSnapshotSection(context));
  sections.push(buildCausalityContractSection());
  sections.push(buildSynopsisSection(context, targetEpisodeNumber));
  sections.push(buildEpisodeCharacterGateSection(context, targetEpisodeNumber));
  sections.push(buildDynamicMemoryLogSection(context, targetEpisodeNumber));
  sections.push(buildCompactWorldSection(context.worldBible));
  sections.push(buildCompactCharacterSection(context.activeCharacters));

  if (targetEpisodeNumber > 1) {
    const previousSummary = buildPreviousSummarySection(context);
    if (previousSummary) sections.push(previousSummary);
  }

  sections.push(
    [
      '<pd_instruction>',
      userInstruction?.trim() || 'PD 지시사항 없음. 시놉시스와 연속성 중심으로 집필하라.',
      '</pd_instruction>',
    ].join('\n')
  );

  sections.push(
    [
      '<final_execution_directive>',
      '시놉시스와 세계관을 우선하며, 스타카토 금지 + Show, Don\'t Tell 원칙으로 4,000~6,000자 본문을 작성하라.',
      '</final_execution_directive>',
    ].join('\n')
  );

  const prompt = sections.filter(Boolean).join('\n\n');
  console.log('[PromptInjector] Prompt assembled:', {
    targetEpisodeNumber,
    startsWithStoryBibleOverride: prompt.startsWith('<story_bible_override>'),
    hasSynopsis: prompt.includes('<episode_synopsis'),
    recentLogCount: context.recentLogs.length,
  });
  return prompt;
}

export async function buildEpisodeGenerationPrompts(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number,
  projectId?: string
): Promise<{ systemPrompt: string; userPrompt: string }> {
  const effectiveProjectId =
    projectId ||
    (context.worldBible as { project_id?: string | null })?.project_id ||
    undefined;

  const systemPrompt = await buildSystemPromptV9(targetEpisodeNumber, effectiveProjectId);
  const userPrompt = buildUserPromptV9(context, userInstruction, targetEpisodeNumber);

  return { systemPrompt, userPrompt };
}

export interface ProseParseResult {
  scenePlan: string | null;
  prose: string;
  raw: string;
}

export function parseProseFromOutput(content: string): ProseParseResult {
  const raw = content;
  const proseMatch = content.match(/\[Prose\]\s*([\s\S]*)/i);
  if (!proseMatch) {
    return { scenePlan: null, prose: content.trim(), raw };
  }

  const scenePlanMatch = content.match(/\[Scene Plan\]\s*([\s\S]*?)\[Prose\]/i);
  return {
    scenePlan: scenePlanMatch ? scenePlanMatch[1].trim() : null,
    prose: proseMatch[1].trim(),
    raw,
  };
}

export function filterProseFromStream(content: string): string {
  const proseIndex = content.indexOf('[Prose]');
  if (proseIndex >= 0) {
    return content.slice(proseIndex + '[Prose]'.length).trimStart();
  }
  if (content.includes('[Scene Plan]')) {
    return '';
  }
  return content;
}

export function buildLogCompressionPrompts(episodeContent: string): {
  systemPrompt: string;
  userPrompt: string;
} {
  return {
    systemPrompt: [
      'You are a strict episode memory logger.',
      'Summarize only factual events from the provided episode.',
      'Return JSON only.',
      'Schema:',
      '{',
      '  "summary": string,',
      '  "characterStates": { "<name>": { "changes": string[], "emotionalArc": string } },',
      '  "itemChanges": { "gained": string[], "lost": string[] },',
      '  "relationshipChanges": [{ "characters": string[], "change": string }],',
      '  "foreshadowing": string[],',
      '  "resolvedHooks": string[]',
      '}',
    ].join('\n'),
    userPrompt: `Analyze the episode and produce memory log JSON.\n\n${episodeContent}`,
  };
}

export function buildFeedbackAnalysisPrompts(
  originalText: string,
  editedText: string
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      'You are a writing-style feedback analyzer.',
      'Compare original text and edited text.',
      'Extract stable preference rules.',
      'Return JSON only.',
      '{',
      '  "feedback_type": string,',
      '  "preference_summary": string,',
      '  "avoid_patterns": string[],',
      '  "favor_patterns": string[],',
      '  "confidence": number',
      '}',
    ].join('\n'),
    userPrompt: [
      '[ORIGINAL]',
      originalText,
      '',
      '[EDITED]',
      editedText,
    ].join('\n'),
  };
}

export function createTestContext(): SlidingWindowContext {
  return {
    worldBible: {
      id: 'test-world',
      project_id: 'test-project',
      world_name: '검황전설',
      time_period: '무협',
      geography: '중원',
      power_system_name: '내공',
      power_system_ranks: null,
      power_system_rules: null,
      absolute_rules: ['시놉시스 우선', '연속성 유지'],
      forbidden_elements: ['현대어 남용'],
      additional_settings: null,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    recentLogs: [],
    lastSceneAnchor: '',
    previousEpisodeEnding: '',
    activeCharacters: [],
    unresolvedHooks: [],
    writingPreferences: [],
    episodeSynopses: [
      {
        episodeNumber: 1,
        title: '테스트 회차',
        synopsis: '주인공이 폐허에서 깨어나 첫 단서를 발견한다.',
        goals: ['상황 파악', '첫 갈등 점화'],
        keyEvents: ['폐허 각성', '노인과 조우', '수상한 흔적 발견'],
        featuredCharacters: ['이청운'],
        location: '폐허',
        timeContext: '새벽',
        arcName: '서막',
        arcPosition: 'start',
        foreshadowing: ['검흔'],
        callbacks: [],
        isCurrent: true,
        forbidden: '현대 용어 남용 금지',
        sceneBeats: '폐허에서 각성 -> 단서 확인 -> 위협 감지',
      },
    ],
  };
}

/** @deprecated Use buildUserPromptV9 directly. */
export function serializeContextToPrompt(context: SlidingWindowContext): string {
  const targetEpisode =
    context.episodeSynopses?.find((item) => item.isCurrent)?.episodeNumber || 1;
  return buildUserPromptV9(context, '', targetEpisode);
}

/** @deprecated Use buildEpisodeGenerationPrompts. */
export async function buildEpisodeGenerationPrompt(
  context: SlidingWindowContext,
  userInstruction: string,
  targetEpisodeNumber: number
): Promise<string> {
  const { userPrompt } = await buildEpisodeGenerationPrompts(
    context,
    userInstruction,
    targetEpisodeNumber
  );
  return userPrompt;
}

/** @deprecated Use buildLogCompressionPrompts. */
export function buildLogCompressionPrompt(episodeContent: string): string {
  return buildLogCompressionPrompts(episodeContent).userPrompt;
}

/** @deprecated Use buildFeedbackAnalysisPrompts. */
export function buildFeedbackAnalysisPrompt(
  originalText: string,
  editedText: string
): string {
  return buildFeedbackAnalysisPrompts(originalText, editedText).userPrompt;
}

export interface LogicCheckResult {
  passed: boolean;
  issues: string[];
  raw: string;
}

export function parseAndRemoveLogicCheck(content: string): {
  cleanContent: string;
  logicCheck: LogicCheckResult | null;
} {
  const match = content.match(/<logic_check>([\s\S]*?)<\/logic_check>/i);
  if (!match) {
    return { cleanContent: content, logicCheck: null };
  }

  const raw = match[1].trim();
  const issues = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || line.toLowerCase().includes('issue'))
    .map((line) => line.replace(/^-+\s*/, ''));

  const passed =
    /passed\s*:\s*true/i.test(raw) ||
    /pass/i.test(raw) && !/fail/i.test(raw);

  const cleanContent = content.replace(/<logic_check>[\s\S]*?<\/logic_check>/gi, '').trim();
  return {
    cleanContent,
    logicCheck: {
      passed,
      issues,
      raw,
    },
  };
}

export interface CharacterStatusTracker {
  characterId: string;
  characterName: string;
  role: string;
  currentLocation: string | null;
  emotionalState: string | null;
  injuries: string[];
  possessedItems: string[];
  changesThisEpisode: {
    locationChange?: { from: string; to: string };
    emotionalChange?: { from: string; to: string };
    newInjuries?: string[];
    healedInjuries?: string[];
    gainedItems?: string[];
    lostItems?: string[];
  };
  lastUpdatedEpisode: number;
}

export function updateCharacterStatusFromLog(
  existingTrackers: CharacterStatusTracker[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logData: any,
  episodeNumber: number
): CharacterStatusTracker[] {
  if (!logData?.characterStates) {
    return existingTrackers;
  }

  const trackers = [...existingTrackers];
  const findOrCreate = (characterName: string) => {
    let tracker = trackers.find((item) => item.characterName === characterName);
    if (!tracker) {
      tracker = {
        characterId: `auto-${characterName}`,
        characterName,
        role: 'unknown',
        currentLocation: null,
        emotionalState: null,
        injuries: [],
        possessedItems: [],
        changesThisEpisode: {},
        lastUpdatedEpisode: episodeNumber,
      };
      trackers.push(tracker);
    }
    return tracker;
  };

  Object.entries(logData.characterStates).forEach(([characterName, rawState]) => {
    const tracker = findOrCreate(characterName);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const state = rawState as any;

    if (typeof state.emotionalArc === 'string' && state.emotionalArc.trim()) {
      const lastEmotion = state.emotionalArc
        .split(/->|→|,|>/)
        .map((item: string) => item.trim())
        .filter(Boolean)
        .at(-1);

      if (lastEmotion && lastEmotion !== tracker.emotionalState) {
        tracker.changesThisEpisode.emotionalChange = {
          from: tracker.emotionalState || 'unknown',
          to: lastEmotion,
        };
        tracker.emotionalState = lastEmotion;
      }
    }

    if (Array.isArray(state.changes)) {
      state.changes.forEach((changeRaw: unknown) => {
        const change = String(changeRaw);
        const lowered = change.toLowerCase();

        if ((/부상|상처|injur/.test(change) || /injur/.test(lowered)) && !tracker.injuries.includes(change)) {
          tracker.injuries.push(change);
          tracker.changesThisEpisode.newInjuries = tracker.changesThisEpisode.newInjuries || [];
          tracker.changesThisEpisode.newInjuries.push(change);
        }

        const locationMatch = change.match(/(?:위치|장소|이동)\s*[:：]\s*(.+)$/);
        if (locationMatch?.[1]) {
          const nextLocation = locationMatch[1].trim();
          tracker.changesThisEpisode.locationChange = {
            from: tracker.currentLocation || 'unknown',
            to: nextLocation,
          };
          tracker.currentLocation = nextLocation;
        }
      });
    }

    tracker.lastUpdatedEpisode = episodeNumber;
  });

  if (logData.itemChanges?.gained && Array.isArray(logData.itemChanges.gained)) {
    const owner = trackers.find((item) => item.role === 'protagonist') || trackers[0];
    if (owner) {
      logData.itemChanges.gained.forEach((item: unknown) => {
        const name = String(item);
        if (!owner.possessedItems.includes(name)) {
          owner.possessedItems.push(name);
          owner.changesThisEpisode.gainedItems = owner.changesThisEpisode.gainedItems || [];
          owner.changesThisEpisode.gainedItems.push(name);
        }
      });
    }
  }

  if (logData.itemChanges?.lost && Array.isArray(logData.itemChanges.lost)) {
    logData.itemChanges.lost.forEach((item: unknown) => {
      const name = String(item);
      trackers.forEach((tracker) => {
        if (!tracker.possessedItems.includes(name)) return;
        tracker.possessedItems = tracker.possessedItems.filter((owned) => owned !== name);
        tracker.changesThisEpisode.lostItems = tracker.changesThisEpisode.lostItems || [];
        tracker.changesThisEpisode.lostItems.push(name);
      });
    });
  }

  return trackers;
}

export function serializeCharacterStatusForPrompt(trackers: CharacterStatusTracker[]): string {
  if (!trackers.length) return '';

  const lines = trackers
    .filter((tracker) =>
      ['protagonist', 'antagonist', 'supporting', 'unknown'].includes(tracker.role)
    )
    .slice(0, 8)
    .map((tracker) => {
      const parts = [tracker.characterName];
      if (tracker.currentLocation) parts.push(`위치:${tracker.currentLocation}`);
      if (tracker.emotionalState) parts.push(`감정:${tracker.emotionalState}`);
      if (tracker.injuries.length) parts.push(`부상:${tracker.injuries[0]}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');

  return `<character_status>\n${lines}\n</character_status>`;
}

export function buildTierBasedCharacterEmphasis(characters: ActiveCharacter[]): string {
  if (!characters?.length) return '';

  const tier1 = characters.filter((character) => character.additionalData?.tier === 1);
  const tier2 = characters.filter((character) => character.additionalData?.tier === 2);

  const lines: string[] = [];
  if (tier1.length) lines.push(`[핵심 인물] ${tier1.map((character) => character.name).join(', ')}`);
  if (tier2.length) lines.push(`[주요 조연] ${tier2.map((character) => character.name).join(', ')}`);

  return lines.join('\n');
}
