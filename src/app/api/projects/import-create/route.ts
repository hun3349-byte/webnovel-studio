import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

type WorldBibleInsert = Database['public']['Tables']['world_bibles']['Insert'];
type CharacterInsert = Database['public']['Tables']['characters']['Insert'];
type StoryHookInsert = Database['public']['Tables']['story_hooks']['Insert'];

/**
 * POST /api/projects/import-create
 *
 * JSON 파일을 받아 새 프로젝트를 생성하고 세계관/캐릭터/떡밥을 일괄 삽입
 *
 * 요청 Body:
 * {
 *   title: string,      // 프로젝트 제목
 *   genre?: string,     // 장르 (선택)
 *   data: LegacyJSON    // Legacy Narrative JSON 데이터
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

interface ImportCreateResult {
  projectId: string;
  projectTitle: string;
  worldBible: boolean;
  characters: string[];
  storyHooks: number;
}

export async function POST(request: NextRequest) {
  let createdProjectId: string | null = null;

  try {
    // 인증 확인
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 요청 바디 파싱
    const body = await request.json();
    const { title, genre, data: legacyData } = body as {
      title: string;
      genre?: string;
      data: LegacyNarrativeData;
    };

    // 유효성 검사
    if (!title?.trim()) {
      return NextResponse.json(
        { error: '프로젝트 제목이 필요합니다.' },
        { status: 400 }
      );
    }

    // 두 가지 구조 지원: { layers: {...} } 또는 { project: { layers: {...} } }
    let normalizedData: LegacyNarrativeData = legacyData;
    if (!legacyData.layers && (legacyData as Record<string, unknown>).project) {
      const projectData = (legacyData as Record<string, unknown>).project as Record<string, unknown>;
      if (projectData.layers) {
        normalizedData = { layers: projectData.layers as LegacyNarrativeData['layers'] };
      }
    }

    if (!normalizedData || !normalizedData.layers) {
      return NextResponse.json(
        { error: '유효하지 않은 JSON 형식입니다. layers 구조가 필요합니다.' },
        { status: 400 }
      );
    }

    // 이후 로직에서는 normalizedData 사용
    const processedData = normalizedData;

    const result: ImportCreateResult = {
      projectId: '',
      projectTitle: title,
      worldBible: false,
      characters: [],
      storyHooks: 0,
    };

    // ============================================
    // 1단계: 프로젝트 생성
    // ============================================
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        title: title.trim(),
        genre: genre || null,
        user_id: user.id,
        status: 'draft',
        total_episodes: 0,
      })
      .select()
      .single();

    if (projectError || !project) {
      throw new Error(`프로젝트 생성 실패: ${projectError?.message || 'Unknown error'}`);
    }

    createdProjectId = project.id;
    result.projectId = project.id;

    // ============================================
    // 2단계: World Bible 삽입
    // ============================================
    try {
      console.log('[Import] World Bible 빌드 시작...');
      const worldBibleData = buildWorldBibleData(processedData, project.id);

      if (worldBibleData) {
        console.log('[Import] World Bible 데이터 생성됨:', {
          world_name: worldBibleData.world_name,
          has_geography: !!worldBibleData.geography,
          has_power_system: !!worldBibleData.power_system_name,
        });

        const { data: insertedWB, error } = await supabase
          .from('world_bibles')
          .insert(worldBibleData)
          .select()
          .single();

        if (error) {
          console.error('[Import] World Bible 삽입 실패:', {
            error_code: error.code,
            error_message: error.message,
            error_details: error.details,
            error_hint: error.hint,
          });
          // 에러가 발생해도 계속 진행 (캐릭터/떡밥 삽입)
        } else {
          console.log('[Import] World Bible 삽입 성공:', insertedWB?.id);
          result.worldBible = true;
        }
      } else {
        console.log('[Import] World Bible 데이터가 null - 스킵');
      }
    } catch (e) {
      console.error('[Import] World Bible 처리 예외:', e);
    }

    // ============================================
    // 3단계: 캐릭터 삽입
    // ============================================
    const charactersToInsert: CharacterInsert[] = [];

    // 주인공 (heroArc)
    if (processedData.layers?.heroArc?.data) {
      const heroData = buildCharacterData(
        processedData.layers!.heroArc!.data,
        project.id,
        'protagonist'
      );
      if (heroData) {
        charactersToInsert.push(heroData);
        result.characters.push(`주인공: ${heroData.name}`);
      }
    }

    // 악역 (villainArc)
    if (processedData.layers?.villainArc?.data) {
      const villainData = buildCharacterData(
        processedData.layers!.villainArc!.data,
        project.id,
        'antagonist'
      );
      if (villainData) {
        charactersToInsert.push(villainData);
        result.characters.push(`악역: ${villainData.name}`);
      }
    }

    // 추가 캐릭터 레이어들
    const supportingLayers = ['supporting', 'mentor', 'rival', 'heroine', 'sidekick'];
    for (const layerName of supportingLayers) {
      const layer = processedData.layers?.[layerName];
      if (layer?.data) {
        const charData = buildCharacterData(layer.data, project.id, 'supporting');
        if (charData) {
          charactersToInsert.push(charData);
          result.characters.push(`조연: ${charData.name}`);
        }
      }
    }

    // 캐릭터 일괄 삽입
    if (charactersToInsert.length > 0) {
      const { error } = await supabase
        .from('characters')
        .insert(charactersToInsert);

      if (error) {
        console.error('캐릭터 삽입 오류:', error);
      }
    }

    // ============================================
    // 4단계: Story Hooks 삽입
    // ============================================
    const hooksToInsert: StoryHookInsert[] = [];

    // ultimateMystery에서 떡밥 추출
    if (processedData.layers?.ultimateMystery?.data) {
      const mysteryHooks = buildStoryHooks(
        processedData.layers!.ultimateMystery!.data,
        project.id
      );
      hooksToInsert.push(...mysteryHooks);
    }

    // seeds에서 떡밥 추출
    if (processedData.layers?.seeds?.data) {
      const seedHooks = buildStoryHooksFromSeeds(
        processedData.layers!.seeds!.data,
        project.id
      );
      hooksToInsert.push(...seedHooks);
    }

    // 떡밥 일괄 삽입
    if (hooksToInsert.length > 0) {
      const { error } = await supabase
        .from('story_hooks')
        .insert(hooksToInsert);

      if (error) {
        console.error('떡밥 삽입 오류:', error);
      } else {
        result.storyHooks = hooksToInsert.length;
      }
    }

    // ============================================
    // 성공 응답
    // ============================================
    return NextResponse.json({
      success: true,
      message: '프로젝트가 성공적으로 생성되었습니다.',
      result,
      redirectUrl: `/projects/${project.id}`,
    });

  } catch (error) {
    console.error('Import-Create 오류:', error);

    // ============================================
    // 롤백: 실패 시 생성된 프로젝트 삭제
    // ============================================
    if (createdProjectId) {
      try {
        const supabase = await createServerSupabaseClient();

        // 관련 데이터 먼저 삭제 (FK 제약)
        await supabase.from('story_hooks').delete().eq('project_id', createdProjectId);
        await supabase.from('characters').delete().eq('project_id', createdProjectId);
        await supabase.from('world_bibles').delete().eq('project_id', createdProjectId);
        await supabase.from('projects').delete().eq('id', createdProjectId);

        console.log('롤백 완료: 프로젝트 삭제됨', createdProjectId);
      } catch (rollbackError) {
        console.error('롤백 실패:', rollbackError);
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '프로젝트 생성에 실패했습니다.',
        code: 'IMPORT_CREATE_FAILED',
      },
      { status: 500 }
    );
  }
}

/**
 * JSON에서 프로젝트 이름 추출 (미리보기용)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    let legacyData = body.data as LegacyNarrativeData;

    // 두 가지 구조 지원: { layers: {...} } 또는 { project: { layers: {...} } }
    if (!legacyData?.layers && (legacyData as Record<string, unknown>).project) {
      const projectData = (legacyData as Record<string, unknown>).project as Record<string, unknown>;
      if (projectData.layers) {
        legacyData = { layers: projectData.layers as LegacyNarrativeData['layers'] };
      }
    }

    if (!legacyData?.layers) {
      return NextResponse.json({ suggestedTitle: null });
    }

    const worldLayer = legacyData.layers.world?.data || {};
    const coreRulesLayer = legacyData.layers.coreRules?.data || {};

    // 프로젝트 이름 후보 추출
    const suggestedTitle =
      extractStringField(worldLayer, ['name', 'worldName', 'title', '세계관명', 'continentName']) ||
      extractStringField(coreRulesLayer, ['name', 'worldName', 'title']) ||
      extractStringField(worldLayer, ['setting', 'background']) ||
      null;

    // 추가 정보 추출
    const genre = extractGenre(worldLayer, coreRulesLayer);
    const characterCount = countCharacters(legacyData);
    const hasWorldBible = !!(worldLayer && Object.keys(worldLayer).length > 0);

    return NextResponse.json({
      suggestedTitle,
      genre,
      preview: {
        hasWorldBible,
        characterCount,
        layers: Object.keys(legacyData.layers || {}),
      },
    });
  } catch {
    return NextResponse.json({ suggestedTitle: null });
  }
}

// ============================================
// 유틸리티 함수들 (import-legacy에서 복사)
// ============================================

function buildWorldBibleData(
  legacyData: LegacyNarrativeData,
  projectId: string
): WorldBibleInsert | null {
  const layers = legacyData.layers;

  console.log('[WorldBible] buildWorldBibleData 시작, layers 존재:', !!layers);

  if (!layers) {
    console.log('[WorldBible] layers가 없음 - null 반환');
    return null;
  }

  const worldLayer = layers.world?.data || {};
  const coreRulesLayer = layers.coreRules?.data || {};
  const seedsLayer = layers.seeds?.data || {};

  console.log('[WorldBible] 레이어 데이터:', {
    worldLayerKeys: Object.keys(worldLayer),
    coreRulesLayerKeys: Object.keys(coreRulesLayer),
    seedsLayerKeys: Object.keys(seedsLayer),
  });

  // ============================================
  // 세계관 이름: continentName, name, worldName 등에서 추출
  // VARCHAR(200) 제한 적용
  // ============================================
  let worldName = extractStringField(worldLayer, ['continentName', 'name', 'worldName', 'title', '세계관명']) ||
                  extractStringField(coreRulesLayer, ['name', 'worldName']) ||
                  '임포트된 세계관';
  worldName = worldName.substring(0, 200);  // VARCHAR(200) 제한

  // ============================================
  // 시대 설정 - VARCHAR(100) 제한 적용
  // ============================================
  let timePeriod = extractStringField(worldLayer, ['era', 'time', 'period', '시대', 'timePeriod']) ||
                   extractStringField(coreRulesLayer, ['era', 'time', 'period']);
  if (timePeriod) timePeriod = timePeriod.substring(0, 100);

  // ============================================
  // 지리 정보: geography + cities + landmarks + mapDescription 통합
  // TEXT 타입이므로 길이 제한 없음
  // ============================================
  const geographyParts: string[] = [];

  // 기본 geography 필드
  const baseGeography = extractStringField(worldLayer, ['geography', 'location', 'setting', '지리', '배경']);
  if (baseGeography) geographyParts.push(baseGeography);

  // cities 배열 파싱 (객체 배열 → 텍스트로 변환)
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

  // landmarks 배열 파싱
  const landmarks = worldLayer['landmarks'];
  if (Array.isArray(landmarks) && landmarks.length > 0) {
    const landmarkList = landmarks.map((lm: unknown) => {
      if (typeof lm === 'string') return `• ${lm}`;
      if (typeof lm === 'object' && lm !== null) {
        const l = lm as Record<string, unknown>;
        const name = l['name'] || '';
        const desc = l['description'] || '';
        return `• ${name}${desc ? `: ${desc}` : ''}`;
      }
      return `• ${JSON.stringify(lm)}`;
    });
    geographyParts.push(`\n\n【주요 지형/명소】\n${landmarkList.join('\n')}`);
  }

  // factions 배열 파싱 (세력/종족)
  const factions = worldLayer['factions'] || coreRulesLayer['factions'];
  if (Array.isArray(factions) && factions.length > 0) {
    const factionList = factions.map((f: unknown) => {
      if (typeof f === 'string') return `• ${f}`;
      if (typeof f === 'object' && f !== null) {
        const fac = f as Record<string, unknown>;
        const name = fac['name'] || '';
        const desc = fac['description'] || '';
        return `• ${name}${desc ? `: ${desc}` : ''}`;
      }
      return `• ${JSON.stringify(f)}`;
    });
    geographyParts.push(`\n\n【세력/종족】\n${factionList.join('\n')}`);
  }

  // mapDescription
  const mapDescription = extractStringField(worldLayer, ['mapDescription', '지도설명', 'mapDesc']);
  if (mapDescription) geographyParts.push(`\n\n【지도 개요】\n${mapDescription}`);

  const geography = geographyParts.length > 0 ? geographyParts.join('') : null;

  // ============================================
  // 파워 시스템: powerSystem - VARCHAR(100) 제한 적용
  // ============================================
  let powerSystemName = extractStringField(coreRulesLayer, ['powerSystem', 'martialArts', '무공체계']) ||
                        extractStringField(worldLayer, ['powerSystem', 'martialArts', 'system']);
  if (powerSystemName) powerSystemName = powerSystemName.substring(0, 100);

  // power_system_ranks: JSONB 배열 - 문자열 배열로 보장
  const powerSystemRanks = extractArrayField(coreRulesLayer, ['ranks', 'levels', '등급', 'powerLevels']) ||
                           extractArrayField(worldLayer, ['ranks', 'levels']) ||
                           [];

  // ============================================
  // 파워 시스템 규칙: powerSource, powerLimits, magicSystem 통합 (TEXT)
  // ============================================
  const powerRulesParts: string[] = [];

  // powerSystem 자체 설명 추가
  const powerSystemDesc = extractStringField(coreRulesLayer, ['powerSystem', '무공체계']);
  if (powerSystemDesc && powerSystemDesc.length > 50) {
    powerRulesParts.push(`【체계 설명】\n${powerSystemDesc}`);
  }

  const powerSource = extractStringField(coreRulesLayer, ['powerSource', '힘의원천', 'source']);
  if (powerSource) powerRulesParts.push(`【힘의 원천】\n${powerSource}`);

  const powerLimits = extractStringField(coreRulesLayer, ['powerLimits', '한계', 'limits']);
  if (powerLimits) powerRulesParts.push(`【한계/제약】\n${powerLimits}`);

  // magicSystem 객체 파싱
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
  // 금기 요소: TEXT[] 배열로 보장
  // ============================================
  let forbiddenElements: string[] = extractArrayField(coreRulesLayer, ['forbidden', 'taboo', '금기', 'prohibitions']) ||
                                    extractArrayField(worldLayer, ['forbidden', 'taboo']) ||
                                    [];

  // magicSystem에서 forbidden 추가
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
  // 추가 설정: JSONB 객체로 보장
  // ============================================
  const additionalSettings: Record<string, unknown> = {
    importedAt: new Date().toISOString(),
  };

  // seeds 레이어에서 갈등/긴장 요소 추출 (문자열로 변환)
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

    const plotSeeds = seedsLayer['plotSeeds'] || seedsLayer['seeds'] || seedsLayer['서사씨앗'];
    if (plotSeeds) {
      additionalSettings['plotSeeds'] = Array.isArray(plotSeeds)
        ? plotSeeds.map((p: unknown) => typeof p === 'string' ? p : JSON.stringify(p))
        : String(plotSeeds);
    }
  }

  // 원본 데이터는 저장하지 않음 (너무 큼) - 대신 요약 정보만
  additionalSettings['importSummary'] = {
    worldLayerFields: Object.keys(worldLayer),
    coreRulesLayerFields: Object.keys(coreRulesLayer),
    seedsLayerFields: Object.keys(seedsLayer),
  };

  const worldBiblePayload = {
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

  console.log('[WorldBible] 최종 페이로드:', {
    project_id: projectId,
    world_name: worldName,
    time_period: timePeriod,
    geography_length: geography?.length || 0,
    power_system_name: powerSystemName,
    power_system_ranks_count: powerSystemRanks?.length || 0,
    power_system_rules_length: powerSystemRules?.length || 0,
    absolute_rules_count: absoluteRules?.length || 0,
    forbidden_elements_count: forbiddenElements?.length || 0,
  });

  return worldBiblePayload;
}

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

function buildStoryHooksFromSeeds(
  data: Record<string, unknown>,
  projectId: string
): StoryHookInsert[] {
  const hooks: StoryHookInsert[] = [];

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

  return hooks;
}

// 유틸리티
function extractStringField(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
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
      if (Array.isArray(value)) return value.join(', ');
      return Object.entries(value)
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('. ');
    }
  }
  return null;
}

function extractGoalsFromComplex(data: Record<string, unknown>): string[] {
  const goals: string[] = [];
  const goalFields = ['goals', 'objectives', 'desires', 'wants', 'needs', '목표', '욕망'];

  for (const field of goalFields) {
    const value = data[field];
    if (typeof value === 'string') goals.push(value);
    else if (Array.isArray(value)) {
      goals.push(...value.map(v => typeof v === 'string' ? v : JSON.stringify(v)));
    }
  }

  return [...new Set(goals)];
}

function buildPowerSystemRules(
  worldLayer: Record<string, unknown>,
  coreRulesLayer: Record<string, unknown>
): string | null {
  const rules: string[] = [];

  const martialArtsRules = extractStringField(worldLayer, ['martialArtsRules', 'powerRules', '무공규칙']);
  if (martialArtsRules) rules.push(martialArtsRules);

  const coreRules = extractStringField(coreRulesLayer, ['martialArtsRules', 'powerRules']);
  if (coreRules) rules.push(coreRules);

  const internalEnergy = extractStringField(worldLayer, ['internalEnergy', '내공', 'qi', 'chi']);
  if (internalEnergy) rules.push(`내공 체계: ${internalEnergy}`);

  return rules.length > 0 ? rules.join('\n\n') : null;
}

function extractKeywords(text: string): string[] {
  const words = text.replace(/[.,!?'"]/g, '').split(/\s+/).filter(word => word.length >= 2 && word.length <= 10);
  return [...new Set(words)].slice(0, 5);
}

function extractGenre(worldLayer: Record<string, unknown>, coreRulesLayer: Record<string, unknown>): string | null {
  const genre = extractStringField(worldLayer, ['genre', '장르']) ||
                extractStringField(coreRulesLayer, ['genre', '장르']);

  if (genre) return genre;

  // 키워드 기반 장르 추론
  const content = JSON.stringify(worldLayer) + JSON.stringify(coreRulesLayer);
  if (content.includes('무협') || content.includes('무공') || content.includes('내공') || content.includes('강호')) return '무협';
  if (content.includes('마법') || content.includes('던전') || content.includes('드래곤')) return '판타지';
  if (content.includes('현대') || content.includes('서울') || content.includes('아파트')) return '현대판타지';
  if (content.includes('로맨스') || content.includes('사랑') || content.includes('연애')) return '로맨스';

  return null;
}

function countCharacters(legacyData: LegacyNarrativeData): number {
  let count = 0;
  const layers = legacyData.layers || {};

  if (layers.heroArc?.data) count++;
  if (layers.villainArc?.data) count++;

  const supportingLayers = ['supporting', 'mentor', 'rival', 'heroine', 'sidekick'];
  for (const layer of supportingLayers) {
    if (layers[layer]?.data) count++;
  }

  return count;
}
