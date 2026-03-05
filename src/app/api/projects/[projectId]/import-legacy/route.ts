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
    const legacyData: LegacyNarrativeData = body.data;

    if (!legacyData || !legacyData.layers) {
      return NextResponse.json(
        { error: 'Invalid JSON format. Expected { data: { layers: {...} } }' },
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
 * World Bible 데이터 구성
 */
function buildWorldBibleData(
  legacyData: LegacyNarrativeData,
  projectId: string
): WorldBibleInsert | null {
  const layers = legacyData.layers;
  if (!layers) return null;

  const worldLayer = layers.world?.data || {};
  const coreRulesLayer = layers.coreRules?.data || {};
  const seedsLayer = layers.seeds?.data || {};

  // 세계관 이름 추출
  const worldName = extractStringField(worldLayer, ['name', 'worldName', 'title', '세계관명']) ||
                    extractStringField(coreRulesLayer, ['name', 'worldName']) ||
                    '임포트된 세계관';

  // 시대 추출
  const timePeriod = extractStringField(worldLayer, ['era', 'time', 'period', '시대', 'timePeriod']) ||
                     extractStringField(coreRulesLayer, ['era', 'time', 'period']);

  // 지리 추출
  const geography = extractStringField(worldLayer, ['geography', 'location', 'setting', '지리', '배경']) ||
                    extractStringField(coreRulesLayer, ['geography', 'location']);

  // 무공 체계 추출
  const powerSystemName = extractStringField(worldLayer, ['powerSystem', 'martialArts', '무공체계', 'system']) ||
                          extractStringField(coreRulesLayer, ['powerSystem', 'martialArts']);

  // 무공 등급
  const powerSystemRanks = extractArrayField(worldLayer, ['ranks', 'levels', '등급', 'powerLevels']) ||
                           extractArrayField(coreRulesLayer, ['ranks', 'levels']);

  // 절대 규칙 추출
  const absoluteRules = extractRulesField(coreRulesLayer, ['rules', 'absoluteRules', '절대규칙', 'laws']) ||
                        extractRulesField(worldLayer, ['rules', 'absoluteRules']);

  // 금기 사항
  const forbiddenElements = extractArrayField(coreRulesLayer, ['forbidden', 'taboo', '금기', 'prohibitions']) ||
                            extractArrayField(worldLayer, ['forbidden', 'taboo']);

  // 추가 설정 (전체 원본 데이터 보존)
  // 원본 데이터를 JSON-compatible 형태로 변환
  const additionalSettings = JSON.parse(JSON.stringify({
    importedAt: new Date().toISOString(),
    originalLayers: {
      world: worldLayer,
      coreRules: coreRulesLayer,
      seeds: seedsLayer,
    },
  }));

  // 무공 규칙 설명
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

/**
 * 캐릭터 데이터 구성
 */
function buildCharacterData(
  data: Record<string, unknown>,
  projectId: string,
  role: 'protagonist' | 'antagonist' | 'supporting'
): CharacterInsert | null {
  // 이름 추출
  const name = extractStringField(data, ['name', '이름', 'characterName', 'title']);
  if (!name) return null;

  // 성격 추출
  const personality = extractStringField(data, ['personality', '성격', 'traits', 'character']) ||
                      extractComplexField(data, ['personality', 'traits']);

  // 배경 추출
  const backstory = extractStringField(data, ['backstory', '배경', 'history', 'background', 'past']) ||
                    extractComplexField(data, ['backstory', 'history', 'background']);

  // 목표 추출
  const goals = extractArrayField(data, ['goals', '목표', 'objectives', 'desires']) ||
                extractGoalsFromComplex(data);

  // 외모 추출
  const appearance = extractStringField(data, ['appearance', '외모', 'looks', 'description']) ||
                     extractComplexField(data, ['appearance', 'looks']);

  // 말투 추출
  const speechPattern = extractStringField(data, ['speechPattern', '말투', 'speech', 'tone', 'manner']);

  // 나이 추출
  const age = extractStringField(data, ['age', '나이', '연령']);

  // 성별 추출
  const gender = extractStringField(data, ['gender', '성별', 'sex']);

  // 추가 데이터 (원본 보존) - JSON-compatible 형태로 변환
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

/**
 * Story Hooks 데이터 구성 (ultimateMystery)
 */
function buildStoryHooks(
  data: Record<string, unknown>,
  projectId: string
): StoryHookInsert[] {
  const hooks: StoryHookInsert[] = [];

  // 미스터리 항목들 추출
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
        created_in_episode_number: 0, // 프롤로그/시작 전
        keywords: extractKeywords(summary),
      });
    }
  }

  // 단일 미스터리 필드 확인
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

  // 복선 추출
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
        hook_type: 'conflict',
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
