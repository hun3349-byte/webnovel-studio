import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type WorldBibleInsert = Database['public']['Tables']['world_bibles']['Insert'];
type CharacterInsert = Database['public']['Tables']['characters']['Insert'];
type StoryHookInsert = Database['public']['Tables']['story_hooks']['Insert'];

/**
 * POST /api/projects/[projectId]/import-legacy
 *
 * Legacy Narrative Simulator JSON 데이터를 현재 프로젝트로 임포트
 *
 * 지원하는 JSON 구조:
 * {
 *   layers: {
 *     world: { data: {...} },        // 세계관 기본 정보
 *     coreRules: { data: {...} },    // 핵심 규칙
 *     seeds: { data: {...} },        // 초기 설정/씨앗
 *     heroArc: { data: {...} },      // 주인공 (강현 등)
 *     villainArc: { data: {...} },   // 악역 (주성휘 등)
 *     ultimateMystery: { data: {...} } // 최종 미스터리/떡밥
 *   }
 * }
 */

interface LegacyLayer {
  data: Record<string, unknown>;
  [key: string]: unknown;
}

interface LegacyNarrativeData {
  layers?: {
    world?: LegacyLayer;
    coreRules?: LegacyLayer;
    seeds?: LegacyLayer;
    heroArc?: LegacyLayer;
    villainArc?: LegacyLayer;
    ultimateMystery?: LegacyLayer;
    [key: string]: LegacyLayer | undefined;
  };
  [key: string]: unknown;
}

interface ImportResult {
  worldBible: boolean;
  characters: string[];
  storyHooks: string[];
  errors: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // 인증 확인
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 프로젝트 소유권 확인
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: '프로젝트를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (project.user_id !== user.id) {
      return NextResponse.json(
        { error: '이 프로젝트에 대한 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // JSON 데이터 파싱
    const body = await request.json();
    let legacyData: LegacyNarrativeData = body.data;

    // 두 가지 구조 지원: { layers: {...} } 또는 { project: { layers: {...} } }
    if (!legacyData?.layers && (legacyData as Record<string, unknown>)?.project) {
      const projectData = (legacyData as Record<string, unknown>).project as Record<string, unknown>;
      if (projectData?.layers) {
        legacyData = { layers: projectData.layers as LegacyNarrativeData['layers'] };
      }
    }

    if (!legacyData || !legacyData.layers) {
      return NextResponse.json(
        { error: 'Invalid JSON format. Expected { data: { layers: {...} } } or { data: { project: { layers: {...} } } }' },
        { status: 400 }
      );
    }

    const result: ImportResult = {
      worldBible: false,
      characters: [],
      storyHooks: [],
      errors: [],
    };

    // ============================================
    // 1. World Bible 임포트
    // ============================================
    try {
      const worldData = await buildWorldBibleData(legacyData, projectId);

      if (worldData) {
        // 기존 World Bible 확인
        const { data: existingWB } = await supabase
          .from('world_bibles')
          .select('id')
          .eq('project_id', projectId)
          .single();

        if (existingWB) {
          // 업데이트 (추가 설정에 병합)
          const { error } = await supabase
            .from('world_bibles')
            .update({
              ...worldData,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingWB.id);

          if (error) throw error;
        } else {
          // 새로 생성
          const { error } = await supabase
            .from('world_bibles')
            .insert(worldData);

          if (error) throw error;
        }

        result.worldBible = true;
      }
    } catch (e) {
      result.errors.push(`World Bible 임포트 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }

    // ============================================
    // 2. 캐릭터 임포트 (주인공/악역)
    // ============================================

    // 주인공 (heroArc)
    if (legacyData.layers.heroArc?.data) {
      try {
        const heroData = buildCharacterData(
          legacyData.layers.heroArc.data,
          projectId,
          'protagonist'
        );

        if (heroData) {
          // 중복 확인 (같은 이름의 캐릭터)
          const { data: existing } = await supabase
            .from('characters')
            .select('id')
            .eq('project_id', projectId)
            .eq('name', heroData.name)
            .single();

          if (!existing) {
            const { error } = await supabase
              .from('characters')
              .insert(heroData);

            if (error) throw error;
            result.characters.push(`주인공: ${heroData.name}`);
          } else {
            result.characters.push(`주인공: ${heroData.name} (이미 존재)`);
          }
        }
      } catch (e) {
        result.errors.push(`주인공 임포트 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // 악역 (villainArc)
    if (legacyData.layers.villainArc?.data) {
      try {
        const villainData = buildCharacterData(
          legacyData.layers.villainArc.data,
          projectId,
          'antagonist'
        );

        if (villainData) {
          // 중복 확인
          const { data: existing } = await supabase
            .from('characters')
            .select('id')
            .eq('project_id', projectId)
            .eq('name', villainData.name)
            .single();

          if (!existing) {
            const { error } = await supabase
              .from('characters')
              .insert(villainData);

            if (error) throw error;
            result.characters.push(`악역: ${villainData.name}`);
          } else {
            result.characters.push(`악역: ${villainData.name} (이미 존재)`);
          }
        }
      } catch (e) {
        result.errors.push(`악역 임포트 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // ============================================
    // 3. 추가 캐릭터 레이어 탐색
    // ============================================
    const characterLayers = ['supporting', 'mentor', 'rival', 'heroine'];
    for (const layerName of characterLayers) {
      const layer = legacyData.layers[layerName];
      if (layer?.data) {
        try {
          const charData = buildCharacterData(
            layer.data,
            projectId,
            'supporting'
          );

          if (charData) {
            const { data: existing } = await supabase
              .from('characters')
              .select('id')
              .eq('project_id', projectId)
              .eq('name', charData.name)
              .single();

            if (!existing) {
              const { error } = await supabase
                .from('characters')
                .insert(charData);

              if (error) throw error;
              result.characters.push(`조연: ${charData.name}`);
            }
          }
        } catch (e) {
          result.errors.push(`${layerName} 임포트 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
    }

    // ============================================
    // 4. Story Hooks 임포트 (ultimateMystery)
    // ============================================
    if (legacyData.layers.ultimateMystery?.data) {
      try {
        const hooks = buildStoryHooks(
          legacyData.layers.ultimateMystery.data,
          projectId
        );

        for (const hook of hooks) {
          // 중복 확인 (비슷한 요약이 있는지)
          const { data: existing } = await supabase
            .from('story_hooks')
            .select('id')
            .eq('project_id', projectId)
            .ilike('summary', `%${hook.summary.substring(0, 30)}%`)
            .single();

          if (!existing) {
            const { error } = await supabase
              .from('story_hooks')
              .insert(hook);

            if (error) throw error;
            result.storyHooks.push(hook.summary);
          } else {
            result.storyHooks.push(`${hook.summary} (이미 존재)`);
          }
        }
      } catch (e) {
        result.errors.push(`떡밥 임포트 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    // ============================================
    // 5. Seeds 레이어에서 추가 떡밥 추출
    // ============================================
    if (legacyData.layers.seeds?.data) {
      try {
        const seedHooks = buildStoryHooksFromSeeds(
          legacyData.layers.seeds.data,
          projectId
        );

        for (const hook of seedHooks) {
          const { data: existing } = await supabase
            .from('story_hooks')
            .select('id')
            .eq('project_id', projectId)
            .ilike('summary', `%${hook.summary.substring(0, 30)}%`)
            .single();

          if (!existing) {
            const { error } = await supabase
              .from('story_hooks')
              .insert(hook);

            if (error) throw error;
            result.storyHooks.push(hook.summary);
          }
        }
      } catch (e) {
        result.errors.push(`Seeds 떡밥 임포트 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: '레거시 데이터 임포트 완료',
      result,
      summary: {
        worldBible: result.worldBible ? '성공' : '실패/스킵',
        charactersImported: result.characters.length,
        hooksImported: result.storyHooks.length,
        errorsCount: result.errors.length,
      },
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

/**
 * World Bible 데이터 구성 - 깊은 필드 추출 + VARCHAR 제한 + 로깅
 */
function buildWorldBibleData(
  legacyData: LegacyNarrativeData,
  projectId: string
): WorldBibleInsert | null {
  const layers = legacyData.layers;

  console.log('[ImportLegacy] buildWorldBibleData 시작');

  if (!layers) {
    console.log('[ImportLegacy] layers가 없음');
    return null;
  }

  const worldLayer = layers.world?.data || {};
  const coreRulesLayer = layers.coreRules?.data || {};
  const seedsLayer = layers.seeds?.data || {};

  console.log('[ImportLegacy] 레이어 필드:', {
    world: Object.keys(worldLayer),
    coreRules: Object.keys(coreRulesLayer),
    seeds: Object.keys(seedsLayer),
  });

  // ============================================
  // 세계관 이름 - VARCHAR(200) 제한
  // ============================================
  let worldName = extractStringField(worldLayer, ['continentName', 'name', 'worldName', 'title', '세계관명']) ||
                  extractStringField(coreRulesLayer, ['name', 'worldName']) ||
                  '임포트된 세계관';
  worldName = worldName.substring(0, 200);

  // ============================================
  // 시대 설정 - VARCHAR(100) 제한
  // ============================================
  let timePeriod = extractStringField(worldLayer, ['era', 'time', 'period', '시대', 'timePeriod']) ||
                   extractStringField(coreRulesLayer, ['era', 'time', 'period']);
  if (timePeriod) timePeriod = timePeriod.substring(0, 100);

  // ============================================
  // 지리 정보 (TEXT - 무제한)
  // ============================================
  const geographyParts: string[] = [];

  const baseGeography = extractStringField(worldLayer, ['geography', 'location', 'setting', '지리', '배경']);
  if (baseGeography) geographyParts.push(baseGeography);

  // cities 배열
  const cities = worldLayer['cities'];
  if (Array.isArray(cities) && cities.length > 0) {
    const cityDescriptions = cities.map((city: unknown) => {
      if (typeof city === 'object' && city !== null) {
        const c = city as Record<string, unknown>;
        const name = c['name'] || c['이름'] || '';
        const desc = c['description'] || c['설명'] || '';
        const loc = c['location'] || c['위치'] || '';
        const sig = c['significance'] || c['중요성'] || '';
        return `• ${name}: ${desc}${loc ? ` (위치: ${loc})` : ''}${sig ? ` [${sig}]` : ''}`;
      }
      return typeof city === 'string' ? `• ${city}` : `• ${JSON.stringify(city)}`;
    });
    geographyParts.push(`\n\n【주요 도시】\n${cityDescriptions.join('\n')}`);
  }

  // landmarks 배열
  const landmarks = worldLayer['landmarks'];
  if (Array.isArray(landmarks) && landmarks.length > 0) {
    const landmarkList = landmarks.map((lm: unknown) => {
      if (typeof lm === 'string') return `• ${lm}`;
      if (typeof lm === 'object' && lm !== null) {
        const l = lm as Record<string, unknown>;
        return `• ${l['name'] || ''}${l['description'] ? `: ${l['description']}` : ''}`;
      }
      return `• ${JSON.stringify(lm)}`;
    });
    geographyParts.push(`\n\n【주요 지형/명소】\n${landmarkList.join('\n')}`);
  }

  // factions
  const factions = worldLayer['factions'] || coreRulesLayer['factions'];
  if (Array.isArray(factions) && factions.length > 0) {
    const factionList = factions.map((f: unknown) => {
      if (typeof f === 'string') return `• ${f}`;
      if (typeof f === 'object' && f !== null) {
        const fac = f as Record<string, unknown>;
        return `• ${fac['name'] || ''}${fac['description'] ? `: ${fac['description']}` : ''}`;
      }
      return `• ${JSON.stringify(f)}`;
    });
    geographyParts.push(`\n\n【세력/종족】\n${factionList.join('\n')}`);
  }

  const mapDescription = extractStringField(worldLayer, ['mapDescription', '지도설명', 'mapDesc']);
  if (mapDescription) geographyParts.push(`\n\n【지도 개요】\n${mapDescription}`);

  const geography = geographyParts.length > 0 ? geographyParts.join('') : null;

  // ============================================
  // 파워 시스템 - VARCHAR(100) 제한
  // ============================================
  let powerSystemName = extractStringField(coreRulesLayer, ['powerSystem', 'martialArts', '무공체계']) ||
                        extractStringField(worldLayer, ['powerSystem', 'martialArts', 'system']);
  if (powerSystemName) powerSystemName = powerSystemName.substring(0, 100);

  // JSONB 배열로 보장
  const powerSystemRanks = extractArrayField(coreRulesLayer, ['ranks', 'levels', '등급', 'powerLevels']) ||
                           extractArrayField(worldLayer, ['ranks', 'levels']) ||
                           [];

  // ============================================
  // 파워 시스템 규칙 (TEXT)
  // ============================================
  const powerRulesParts: string[] = [];

  const powerSystemDesc = extractStringField(coreRulesLayer, ['powerSystem', '무공체계']);
  if (powerSystemDesc && powerSystemDesc.length > 50) {
    powerRulesParts.push(`【체계 설명】\n${powerSystemDesc}`);
  }

  const powerSource = extractStringField(coreRulesLayer, ['powerSource', '힘의원천', 'source']);
  if (powerSource) powerRulesParts.push(`【힘의 원천】\n${powerSource}`);

  const powerLimits = extractStringField(coreRulesLayer, ['powerLimits', '한계', 'limits']);
  if (powerLimits) powerRulesParts.push(`【한계/제약】\n${powerLimits}`);

  const magicSystem = coreRulesLayer['magicSystem'];
  if (typeof magicSystem === 'object' && magicSystem !== null) {
    const ms = magicSystem as Record<string, unknown>;
    const magicParts: string[] = [];
    if (ms['types']) magicParts.push(`종류: ${typeof ms['types'] === 'string' ? ms['types'] : JSON.stringify(ms['types'])}`);
    if (ms['activation']) magicParts.push(`발동 조건: ${typeof ms['activation'] === 'string' ? ms['activation'] : JSON.stringify(ms['activation'])}`);
    if (ms['counters']) magicParts.push(`대응 방법: ${typeof ms['counters'] === 'string' ? ms['counters'] : JSON.stringify(ms['counters'])}`);
    if (ms['forbidden']) magicParts.push(`금기: ${typeof ms['forbidden'] === 'string' ? ms['forbidden'] : JSON.stringify(ms['forbidden'])}`);
    if (magicParts.length > 0) {
      powerRulesParts.push(`【마법/특수 체계】\n${magicParts.join('\n')}`);
    }
  }

  const powerSystemRules = powerRulesParts.length > 0
    ? powerRulesParts.join('\n\n')
    : buildPowerSystemRules(worldLayer, coreRulesLayer);

  // ============================================
  // 절대 규칙 - JSONB 배열로 보장
  // ============================================
  const absoluteRules = extractRulesField(coreRulesLayer, ['rules', 'absoluteRules', '절대규칙', 'laws']) ||
                        extractRulesField(worldLayer, ['rules', 'absoluteRules']) ||
                        [];

  // ============================================
  // 금기 요소 - TEXT[] 배열로 보장
  // ============================================
  let forbiddenElements: string[] = extractArrayField(coreRulesLayer, ['forbidden', 'taboo', '금기', 'prohibitions']) ||
                                    extractArrayField(worldLayer, ['forbidden', 'taboo']) ||
                                    [];

  if (typeof magicSystem === 'object' && magicSystem !== null) {
    const ms = magicSystem as Record<string, unknown>;
    if (ms['forbidden']) {
      const forbiddenStr = typeof ms['forbidden'] === 'string'
        ? ms['forbidden']
        : JSON.stringify(ms['forbidden']);
      forbiddenElements.push(`[마법 금기] ${forbiddenStr}`);
    }
  }

  // ============================================
  // 추가 설정 - JSONB
  // ============================================
  const additionalSettings: Record<string, unknown> = {
    importedAt: new Date().toISOString(),
    importSummary: {
      worldLayerFields: Object.keys(worldLayer),
      coreRulesLayerFields: Object.keys(coreRulesLayer),
      seedsLayerFields: Object.keys(seedsLayer),
    },
  };

  if (seedsLayer && Object.keys(seedsLayer).length > 0) {
    const conflicts = seedsLayer['conflicts'] || seedsLayer['tensions'] || seedsLayer['갈등'];
    if (conflicts) {
      additionalSettings['conflicts'] = Array.isArray(conflicts)
        ? conflicts.map((c: unknown) => typeof c === 'string' ? c : JSON.stringify(c))
        : String(conflicts);
    }

    const themes = seedsLayer['themes'] || seedsLayer['주제'];
    if (themes) {
      additionalSettings['themes'] = Array.isArray(themes)
        ? themes.map((t: unknown) => typeof t === 'string' ? t : JSON.stringify(t))
        : String(themes);
    }
  }

  const payload = {
    project_id: projectId,
    world_name: worldName,
    time_period: timePeriod,
    geography: geography,
    power_system_name: powerSystemName,
    power_system_ranks: powerSystemRanks,
    power_system_rules: powerSystemRules,
    absolute_rules: absoluteRules,
    forbidden_elements: forbiddenElements,
    additional_settings: JSON.parse(JSON.stringify(additionalSettings)),
    version: 1,
  };

  console.log('[ImportLegacy] World Bible 페이로드 생성 완료:', {
    world_name: worldName,
    has_geography: !!geography,
    geography_length: geography?.length || 0,
    power_system_ranks_count: powerSystemRanks.length,
    absolute_rules_count: absoluteRules.length,
    forbidden_elements_count: forbiddenElements.length,
  });

  return payload;
}

/**
 * 캐릭터 데이터 구성 - 깊은 필드 추출
 */
function buildCharacterData(
  data: Record<string, unknown>,
  projectId: string,
  role: 'protagonist' | 'antagonist' | 'supporting'
): CharacterInsert | null {
  // ============================================
  // 캐릭터 이름 (필수)
  // ============================================
  const name = extractStringField(data, ['name', '이름', 'characterName', 'title']);
  if (!name) return null;

  // ============================================
  // 나이: number 또는 string 처리
  // ============================================
  let age: string | null = null;
  const ageValue = data['age'] ?? data['나이'] ?? data['연령'];
  if (typeof ageValue === 'number') {
    age = `${ageValue}세`;
  } else if (typeof ageValue === 'string') {
    age = ageValue;
  }

  // ============================================
  // 성격: personality + strengths[] 통합
  // ============================================
  const personalityParts: string[] = [];

  // 기본 personality 필드
  const basePersonality = extractStringField(data, ['personality', '성격', 'traits', 'character']);
  if (basePersonality) personalityParts.push(basePersonality);

  // strengths 배열 (성격적 강점)
  const strengths = data['strengths'] || data['장점'] || data['특성'];
  if (Array.isArray(strengths) && strengths.length > 0) {
    const strengthList = strengths.map((s: unknown) =>
      typeof s === 'string' ? s : JSON.stringify(s)
    );
    personalityParts.push(`【성격적 강점】 ${strengthList.join(', ')}`);
  }

  // 악역의 경우: selfJustification, worldMadeMe 등 추가
  if (role === 'antagonist') {
    const selfJustification = extractStringField(data, ['selfJustification', '자기합리화', 'justification']);
    if (selfJustification) personalityParts.push(`【자기 합리화】 ${selfJustification}`);

    const worldMadeMe = extractStringField(data, ['worldMadeMe', '세상탓', 'blame']);
    if (worldMadeMe) personalityParts.push(`【원한의 근원】 ${worldMadeMe}`);
  }

  const personality = personalityParts.length > 0 ? personalityParts.join('\n\n') : null;

  // ============================================
  // 배경: origin + faction + coreNarrative + fatalWeakness 통합
  // ============================================
  const backstoryParts: string[] = [];

  // origin (출신/내력)
  const origin = extractStringField(data, ['origin', '출신', 'birthplace', 'background']);
  if (origin) backstoryParts.push(`【출신】 ${origin}`);

  // faction (소속 세력)
  const faction = extractStringField(data, ['faction', '소속', 'affiliation', 'group', 'organization']);
  if (faction) backstoryParts.push(`【소속】 ${faction}`);

  // coreNarrative (핵심 서사)
  const coreNarrative = extractStringField(data, ['coreNarrative', '핵심서사', 'narrative', 'story']);
  if (coreNarrative) backstoryParts.push(`【핵심 서사】 ${coreNarrative}`);

  // 기존 backstory 필드
  const baseBackstory = extractStringField(data, ['backstory', '배경스토리', 'history', 'past']);
  if (baseBackstory) backstoryParts.push(baseBackstory);

  // fatalWeakness (치명적 약점)
  const fatalWeakness = extractStringField(data, ['fatalWeakness', '치명적약점', 'weakness', 'flaw']);
  if (fatalWeakness) backstoryParts.push(`【치명적 약점】 ${fatalWeakness}`);

  // anxietyConditions (불안 조건)
  const anxietyConditions = extractStringField(data, ['anxietyConditions', '불안조건', 'anxiety']);
  if (anxietyConditions) backstoryParts.push(`【불안 조건】 ${anxietyConditions}`);

  // 악역의 경우: relationship (관계)
  if (role === 'antagonist') {
    const relationship = extractStringField(data, ['relationship', '관계', 'connections']);
    if (relationship) backstoryParts.push(`【주요 관계】 ${relationship}`);
  }

  const backstory = backstoryParts.length > 0 ? backstoryParts.join('\n\n') : null;

  // ============================================
  // 목표: goals + ultimateGoal + abilities + surfaceGoal + motivation 통합
  // ============================================
  const goalsList: string[] = [];

  // ultimateGoal (궁극적 목표)
  const ultimateGoal = extractStringField(data, ['ultimateGoal', '궁극목표', 'finalGoal', 'endGoal']);
  if (ultimateGoal) goalsList.push(`[궁극 목표] ${ultimateGoal}`);

  // surfaceGoal (표면적 목표 - 악역용)
  const surfaceGoal = extractStringField(data, ['surfaceGoal', '표면목표', 'publicGoal']);
  if (surfaceGoal) goalsList.push(`[표면 목표] ${surfaceGoal}`);

  // motivation (동기 - 악역용)
  const motivation = extractStringField(data, ['motivation', '동기', 'motive']);
  if (motivation) goalsList.push(`[핵심 동기] ${motivation}`);

  // 기존 goals 배열
  const baseGoals = data['goals'] || data['목표'] || data['objectives'];
  if (Array.isArray(baseGoals)) {
    goalsList.push(...baseGoals.map((g: unknown) =>
      typeof g === 'string' ? g : JSON.stringify(g)
    ));
  } else if (typeof baseGoals === 'string') {
    goalsList.push(baseGoals);
  }

  // abilities (능력/무공)
  const abilities = data['abilities'] || data['능력'] || data['무공'] || data['skills'];
  if (Array.isArray(abilities) && abilities.length > 0) {
    const abilityList = abilities.map((a: unknown) =>
      typeof a === 'string' ? a : JSON.stringify(a)
    );
    goalsList.push(`[보유 능력] ${abilityList.join(', ')}`);
  }

  const goals = goalsList.length > 0 ? goalsList : null;

  // ============================================
  // 외모
  // ============================================
  const appearance = extractStringField(data, ['appearance', '외모', 'looks', 'description', 'physicalDescription']) ||
                     extractComplexField(data, ['appearance', 'looks']);

  // ============================================
  // 말투
  // ============================================
  const speechPattern = extractStringField(data, ['speechPattern', '말투', 'speech', 'tone', 'manner', 'dialogue']);

  // ============================================
  // 성별
  // ============================================
  const gender = extractStringField(data, ['gender', '성별', 'sex']);

  // ============================================
  // 추가 데이터: 원본 보존 + 추가 필드
  // ============================================
  const additionalData: Record<string, unknown> = {
    importedAt: new Date().toISOString(),
  };

  // 원본 데이터에서 이미 매핑되지 않은 필드들 저장
  const mappedKeys = [
    'name', '이름', 'age', '나이', 'personality', '성격', 'origin', '출신',
    'faction', '소속', 'backstory', 'coreNarrative', 'goals', '목표',
    'ultimateGoal', 'abilities', '능력', 'strengths', '장점', 'appearance',
    '외모', 'speechPattern', '말투', 'gender', '성별', 'fatalWeakness',
    'anxietyConditions', 'selfJustification', 'worldMadeMe', 'relationship',
    'surfaceGoal', 'motivation'
  ];

  const unmappedData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!mappedKeys.includes(key) && value !== null && value !== undefined) {
      unmappedData[key] = value;
    }
  }

  if (Object.keys(unmappedData).length > 0) {
    additionalData['unmappedFields'] = unmappedData;
  }

  // 원본 전체 데이터도 보존
  additionalData['originalData'] = data;

  return {
    project_id: projectId,
    name,
    role,
    personality,
    backstory,
    goals,
    appearance,
    speech_pattern: speechPattern,
    age,
    gender,
    is_alive: true,
    additional_data: JSON.parse(JSON.stringify(additionalData)),
  };
}

/**
 * Story Hooks 데이터 구성 (ultimateMystery) - 깊은 필드 추출
 */
function buildStoryHooks(
  data: Record<string, unknown>,
  projectId: string
): StoryHookInsert[] {
  const hooks: StoryHookInsert[] = [];

  // ============================================
  // 1. surface (표면적 미스터리) - 최고 중요도
  // ============================================
  const surface = extractStringField(data, ['surface', '표면', 'surfaceMystery', '겉으로보이는것']);
  if (surface) {
    hooks.push({
      project_id: projectId,
      hook_type: 'mystery',
      summary: `[표면] ${surface}`,
      detail: JSON.stringify({ type: 'surface', originalData: data }),
      importance: 10,
      status: 'open',
      created_in_episode_number: 0,
      keywords: extractKeywords(surface),
    });
  }

  // ============================================
  // 2. truth (진실/핵심 미스터리) - 최고 중요도
  // ============================================
  const truth = extractStringField(data, ['truth', '진실', 'realTruth', '숨겨진진실']);
  if (truth) {
    hooks.push({
      project_id: projectId,
      hook_type: 'mystery',
      summary: `[진실] ${truth}`,
      detail: JSON.stringify({ type: 'truth', originalData: data }),
      importance: 10,
      status: 'open',
      created_in_episode_number: 0,
      keywords: extractKeywords(truth),
    });
  }

  // ============================================
  // 3. hints 배열 (복선) - 중요도 7
  // ============================================
  const hints = data['hints'] || data['힌트'] || data['복선'];
  if (Array.isArray(hints) && hints.length > 0) {
    for (const hint of hints) {
      const summary = typeof hint === 'string'
        ? hint
        : extractStringField(hint as Record<string, unknown>, ['summary', 'hint', 'content', 'description']);
      if (summary) {
        hooks.push({
          project_id: projectId,
          hook_type: 'foreshadowing',
          summary,
          detail: typeof hint === 'object' ? JSON.stringify(hint) : null,
          importance: 7,
          status: 'open',
          created_in_episode_number: 0,
          keywords: extractKeywords(summary),
        });
      }
    }
  }

  // ============================================
  // 4. revealTiming (공개 타이밍) - setup으로 저장
  // ============================================
  const revealTiming = extractStringField(data, ['revealTiming', '공개시점', 'reveal']);
  if (revealTiming) {
    hooks.push({
      project_id: projectId,
      hook_type: 'setup',
      summary: `[공개 시점] ${revealTiming}`,
      importance: 6,
      status: 'open',
      created_in_episode_number: 0,
      keywords: extractKeywords(revealTiming),
    });
  }

  // ============================================
  // 5. middleTwists 배열 (중간 반전) - 중요도 8
  // ============================================
  const middleTwists = data['middleTwists'] || data['중간반전'] || data['twists'];
  if (Array.isArray(middleTwists) && middleTwists.length > 0) {
    for (const twist of middleTwists) {
      const summary = typeof twist === 'string'
        ? twist
        : extractStringField(twist as Record<string, unknown>, ['summary', 'twist', 'content', 'description']);
      if (summary) {
        hooks.push({
          project_id: projectId,
          hook_type: 'setup',
          summary: `[중간 반전] ${summary}`,
          detail: typeof twist === 'object' ? JSON.stringify(twist) : null,
          importance: 8,
          status: 'open',
          created_in_episode_number: 0,
          keywords: extractKeywords(summary),
        });
      }
    }
  }

  // ============================================
  // 6. 기존 mysteries/secrets 배열 (호환성)
  // ============================================
  const mysteries = extractArrayField(data, ['mysteries', 'secrets', '비밀']) || [];
  for (const mystery of mysteries) {
    const summary = typeof mystery === 'string'
      ? mystery
      : extractStringField(mystery as Record<string, unknown>, ['summary', 'description', 'content']);
    if (summary && !hooks.some(h => h.summary?.includes(summary))) {
      hooks.push({
        project_id: projectId,
        hook_type: 'mystery',
        summary,
        detail: typeof mystery === 'object' ? JSON.stringify(mystery) : null,
        importance: 8,
        status: 'open',
        created_in_episode_number: 0,
        keywords: extractKeywords(summary),
      });
    }
  }

  // ============================================
  // 7. 단일 ultimateMystery 필드 (호환성)
  // ============================================
  const singleMystery = extractStringField(data, ['ultimateMystery', 'mainMystery', '최종미스터리']);
  if (singleMystery && !hooks.some(h => h.summary?.includes(singleMystery))) {
    hooks.push({
      project_id: projectId,
      hook_type: 'mystery',
      summary: singleMystery,
      detail: JSON.stringify(data),
      importance: 10,
      status: 'open',
      created_in_episode_number: 0,
      keywords: extractKeywords(singleMystery),
    });
  }

  // ============================================
  // 8. 기존 foreshadowing 배열 (호환성)
  // ============================================
  const foreshadowings = extractArrayField(data, ['foreshadowing', '복선배열']) || [];
  for (const hint of foreshadowings) {
    const summary = typeof hint === 'string'
      ? hint
      : extractStringField(hint as Record<string, unknown>, ['summary', 'hint', 'content']);
    if (summary && !hooks.some(h => h.summary === summary)) {
      hooks.push({
        project_id: projectId,
        hook_type: 'foreshadowing',
        summary,
        importance: 5,
        status: 'open',
        created_in_episode_number: 0,
        keywords: extractKeywords(summary),
      });
    }
  }

  return hooks;
}

/**
 * Seeds 레이어에서 떡밥 추출
 */
function buildStoryHooksFromSeeds(
  data: Record<string, unknown>,
  projectId: string
): StoryHookInsert[] {
  const hooks: StoryHookInsert[] = [];

  // 시드/설정에서 떡밥성 내용 추출
  const conflicts = extractArrayField(data, ['conflicts', 'tensions', '갈등', 'problems']) || [];
  for (const conflict of conflicts) {
    const summary = typeof conflict === 'string' ? conflict : extractStringField(conflict as Record<string, unknown>, ['summary', 'description']);
    if (summary) {
      hooks.push({
        project_id: projectId,
        hook_type: 'setup',  // 유효값: foreshadowing, mystery, promise, setup, chekhov_gun
        summary,
        importance: 6,
        status: 'open',
        created_in_episode_number: 0,
        keywords: extractKeywords(summary),
      });
    }
  }

  // 초기 이벤트
  const events = extractArrayField(data, ['events', 'initialEvents', '초기이벤트']) || [];
  for (const event of events) {
    const summary = typeof event === 'string' ? event : extractStringField(event as Record<string, unknown>, ['summary', 'description']);
    if (summary) {
      hooks.push({
        project_id: projectId,
        hook_type: 'setup',
        summary,
        importance: 4,
        status: 'open',
        created_in_episode_number: 0,
        keywords: extractKeywords(summary),
      });
    }
  }

  return hooks;
}

// ============================================
// 유틸리티 함수들
// ============================================

function extractStringField(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function extractArrayField(data: Record<string, unknown>, keys: string[]): string[] | null {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.map(v => typeof v === 'string' ? v : JSON.stringify(v));
    }
  }
  return null;
}

function extractRulesField(data: Record<string, unknown>, keys: string[]): string[] | null {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value.map(v => typeof v === 'string' ? v : JSON.stringify(v));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    }
  }
  return null;
}

function extractComplexField(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'object' && value !== null) {
      // 객체를 읽기 좋은 문자열로 변환
      if (Array.isArray(value)) {
        return value.join(', ');
      }
      return Object.entries(value)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('. ');
    }
  }
  return null;
}

function extractGoalsFromComplex(data: Record<string, unknown>): string[] {
  const goals: string[] = [];

  // 목표 관련 필드 탐색
  const goalFields = ['goals', 'objectives', 'desires', 'wants', 'needs', '목표', '욕망'];
  for (const field of goalFields) {
    const value = data[field];
    if (typeof value === 'string') {
      goals.push(value);
    } else if (Array.isArray(value)) {
      goals.push(...value.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
    }
  }

  // arc 관련 필드에서 목표 추출
  const arcFields = ['arc', 'journey', 'development'];
  for (const field of arcFields) {
    const value = data[field];
    if (typeof value === 'object' && value !== null) {
      const arcGoals = (value as Record<string, unknown>)['goals'] || (value as Record<string, unknown>)['objective'];
      if (typeof arcGoals === 'string') {
        goals.push(arcGoals);
      }
    }
  }

  return [...new Set(goals)]; // 중복 제거
}

function buildPowerSystemRules(
  worldLayer: Record<string, unknown>,
  coreRulesLayer: Record<string, unknown>
): string | null {
  const rules: string[] = [];

  // 무공 관련 규칙 추출
  const martialArtsRules = extractStringField(worldLayer, ['martialArtsRules', 'powerRules', '무공규칙']);
  if (martialArtsRules) rules.push(martialArtsRules);

  const coreRules = extractStringField(coreRulesLayer, ['martialArtsRules', 'powerRules']);
  if (coreRules) rules.push(coreRules);

  // 내공/기 관련
  const internalEnergy = extractStringField(worldLayer, ['internalEnergy', '내공', 'qi', 'chi']);
  if (internalEnergy) rules.push(`내공 체계: ${internalEnergy}`);

  return rules.length > 0 ? rules.join('\n\n') : null;
}

function extractKeywords(text: string): string[] {
  // 간단한 키워드 추출 (2글자 이상 단어)
  const words = text
    .replace(/[.,!?'"]/g, '')
    .split(/\s+/)
    .filter(word => word.length >= 2 && word.length <= 10);

  return [...new Set(words)].slice(0, 5);
}

/**
 * GET: API 정보
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/projects/[projectId]/import-legacy',
    method: 'POST',
    description: 'Legacy Narrative Simulator JSON 데이터 임포트',
    body: {
      data: 'Legacy JSON object with layers structure',
    },
    supportedLayers: [
      'world - 세계관 기본 정보',
      'coreRules - 핵심 규칙 및 절대 규칙',
      'seeds - 초기 설정 및 씨앗',
      'heroArc - 주인공 캐릭터 정보',
      'villainArc - 악역 캐릭터 정보',
      'ultimateMystery - 최종 미스터리 및 떡밥',
    ],
    mappings: {
      'layers.world/coreRules/seeds': 'world_bibles 테이블',
      'layers.heroArc': 'characters 테이블 (role: protagonist)',
      'layers.villainArc': 'characters 테이블 (role: antagonist)',
      'layers.ultimateMystery': 'story_hooks 테이블',
    },
  });
}
