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
        status: 'active',
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
      const worldBibleData = buildWorldBibleData(processedData, project.id);

      if (worldBibleData) {
        const { error } = await supabase
          .from('world_bibles')
          .insert(worldBibleData);

        if (error) {
          console.error('World Bible 삽입 오류:', error);
        } else {
          result.worldBible = true;
        }
      }
    } catch (e) {
      console.error('World Bible 처리 오류:', e);
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
  if (!layers) return null;

  const worldLayer = layers.world?.data || {};
  const coreRulesLayer = layers.coreRules?.data || {};
  const seedsLayer = layers.seeds?.data || {};

  const worldName = extractStringField(worldLayer, ['name', 'worldName', 'title', '세계관명', 'continentName']) ||
                    extractStringField(coreRulesLayer, ['name', 'worldName']) ||
                    '임포트된 세계관';

  const timePeriod = extractStringField(worldLayer, ['era', 'time', 'period', '시대', 'timePeriod']) ||
                     extractStringField(coreRulesLayer, ['era', 'time', 'period']);

  const geography = extractStringField(worldLayer, ['geography', 'location', 'setting', '지리', '배경']) ||
                    extractStringField(coreRulesLayer, ['geography', 'location']);

  const powerSystemName = extractStringField(worldLayer, ['powerSystem', 'martialArts', '무공체계', 'system']) ||
                          extractStringField(coreRulesLayer, ['powerSystem', 'martialArts']);

  const powerSystemRanks = extractArrayField(worldLayer, ['ranks', 'levels', '등급', 'powerLevels']) ||
                           extractArrayField(coreRulesLayer, ['ranks', 'levels']);

  const absoluteRules = extractRulesField(coreRulesLayer, ['rules', 'absoluteRules', '절대규칙', 'laws']) ||
                        extractRulesField(worldLayer, ['rules', 'absoluteRules']);

  const forbiddenElements = extractArrayField(coreRulesLayer, ['forbidden', 'taboo', '금기', 'prohibitions']) ||
                            extractArrayField(worldLayer, ['forbidden', 'taboo']);

  const additionalSettings = JSON.parse(JSON.stringify({
    importedAt: new Date().toISOString(),
    originalLayers: { world: worldLayer, coreRules: coreRulesLayer, seeds: seedsLayer },
  }));

  const powerSystemRules = buildPowerSystemRules(worldLayer, coreRulesLayer);

  return {
    project_id: projectId,
    world_name: worldName,
    time_period: timePeriod,
    geography: geography,
    power_system_name: powerSystemName,
    power_system_ranks: powerSystemRanks,
    power_system_rules: powerSystemRules,
    absolute_rules: absoluteRules,
    forbidden_elements: forbiddenElements,
    additional_settings: additionalSettings,
    version: 1,
  };
}

function buildCharacterData(
  data: Record<string, unknown>,
  projectId: string,
  role: 'protagonist' | 'antagonist' | 'supporting'
): CharacterInsert | null {
  const name = extractStringField(data, ['name', '이름', 'characterName', 'title']);
  if (!name) return null;

  const personality = extractStringField(data, ['personality', '성격', 'traits', 'character']) ||
                      extractComplexField(data, ['personality', 'traits']);

  const backstory = extractStringField(data, ['backstory', '배경', 'history', 'background', 'past']) ||
                    extractComplexField(data, ['backstory', 'history', 'background']);

  const goals = extractArrayField(data, ['goals', '목표', 'objectives', 'desires']) ||
                extractGoalsFromComplex(data);

  const appearance = extractStringField(data, ['appearance', '외모', 'looks', 'description']) ||
                     extractComplexField(data, ['appearance', 'looks']);

  const speechPattern = extractStringField(data, ['speechPattern', '말투', 'speech', 'tone', 'manner']);
  const age = extractStringField(data, ['age', '나이', '연령']);
  const gender = extractStringField(data, ['gender', '성별', 'sex']);

  const additionalData = JSON.parse(JSON.stringify({
    importedAt: new Date().toISOString(),
    originalData: data,
  }));

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
    additional_data: additionalData,
  };
}

function buildStoryHooks(
  data: Record<string, unknown>,
  projectId: string
): StoryHookInsert[] {
  const hooks: StoryHookInsert[] = [];

  const mysteries = extractArrayField(data, ['mysteries', 'secrets', '비밀', 'hooks', 'foreshadowing']) || [];
  for (const mystery of mysteries) {
    const summary = typeof mystery === 'string' ? mystery : extractStringField(mystery as Record<string, unknown>, ['summary', 'description', 'content']);
    if (summary) {
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

  const singleMystery = extractStringField(data, ['ultimateMystery', 'mainMystery', '최종미스터리']);
  if (singleMystery && !hooks.some(h => h.summary === singleMystery)) {
    hooks.push({
      project_id: projectId,
      hook_type: 'ultimate_mystery',
      summary: singleMystery,
      detail: JSON.stringify(data),
      importance: 10,
      status: 'open',
      created_in_episode_number: 0,
      keywords: extractKeywords(singleMystery),
    });
  }

  const foreshadowings = extractArrayField(data, ['foreshadowing', '복선', 'hints']) || [];
  for (const hint of foreshadowings) {
    const summary = typeof hint === 'string' ? hint : extractStringField(hint as Record<string, unknown>, ['summary', 'hint', 'content']);
    if (summary) {
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
        hook_type: 'conflict',
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
