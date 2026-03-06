import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  extractCharactersFromEpisode,
  convertToDbFormat,
  CharacterExtractionResult,
} from '@/core/memory/character-extractor';

/**
 * POST /api/ai/extract-characters
 *
 * 에피소드에서 새로운 캐릭터를 자동 추출하여 DB에 저장
 * - 채택(adopt) 후 백그라운드에서 호출됨
 * - 새 인물은 extra(Tier 3)로 자동 등록
 * - 관계 데이터도 함께 갱신
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { episodeId, projectId, useMock = false } = body;

    if (!episodeId || !projectId) {
      return NextResponse.json(
        { error: 'episodeId and projectId are required' },
        { status: 400 }
      );
    }

    console.log('[ExtractCharacters] 시작:', { episodeId, projectId });

    // 1. 에피소드 조회
    const { data: episode, error: episodeError } = await supabase
      .from('episodes')
      .select('content, episode_number')
      .eq('id', episodeId)
      .eq('project_id', projectId)
      .single();

    if (episodeError || !episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 });
    }

    // 2. 기존 캐릭터 목록 조회
    const { data: existingCharacters } = await supabase
      .from('characters')
      .select('id, name')
      .eq('project_id', projectId);

    const existingNames = (existingCharacters || []).map(c => c.name);

    // 3. 주인공 이름 찾기
    const protagonist = (existingCharacters || []).find(c => {
      // role 필드는 없을 수 있으므로 이름으로 추정
      return true; // 첫 번째 캐릭터를 임시로 사용
    });
    const protagonistName = protagonist?.name || '주인공';

    // 4. AI 캐릭터 추출 실행
    const extractionResult: CharacterExtractionResult = await extractCharactersFromEpisode(
      episode.content || '',
      episode.episode_number,
      existingNames,
      protagonistName,
      useMock
    );

    console.log('[ExtractCharacters] 추출 결과:', {
      newCharacters: extractionResult.newCharacters.length,
      existingMentions: extractionResult.existingCharacterMentions.length,
      relationships: extractionResult.relationshipUpdates.length,
    });

    // 5. 새 캐릭터 DB 저장
    const savedCharacters = [];
    for (const extracted of extractionResult.newCharacters) {
      // 신뢰도 0.5 이상만 저장
      if (extracted.confidence < 0.5) continue;

      // 이미 존재하는지 다시 확인
      const { data: existing } = await supabase
        .from('characters')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', extracted.name)
        .single();

      if (existing) {
        console.log(`[ExtractCharacters] 이미 존재: ${extracted.name}`);
        continue;
      }

      const dbData = convertToDbFormat(
        extracted,
        projectId,
        episodeId,
        episode.episode_number
      );

      const { data: saved, error: saveError } = await supabase
        .from('characters')
        .insert(dbData)
        .select()
        .single();

      if (saveError) {
        console.error(`[ExtractCharacters] 저장 실패: ${extracted.name}`, saveError);
      } else {
        savedCharacters.push(saved);
        console.log(`[ExtractCharacters] 새 캐릭터 저장: ${extracted.name}`);
      }
    }

    // 6. 관계 데이터 갱신
    const relationshipsUpdated = [];
    for (const rel of extractionResult.relationshipUpdates) {
      // 캐릭터 ID 찾기
      const { data: charA } = await supabase
        .from('characters')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', rel.characterAName)
        .single();

      const { data: charB } = await supabase
        .from('characters')
        .select('id')
        .eq('project_id', projectId)
        .eq('name', rel.characterBName)
        .single();

      if (!charA || !charB) continue;

      // 관계 upsert
      const { error: relError } = await supabase
        .from('character_relationships')
        .upsert({
          project_id: projectId,
          character_a_id: charA.id,
          character_b_id: charB.id,
          relationship_type: mapRelationshipType(rel.relationshipType),
          description: rel.description,
          intensity: rel.intensity,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'character_a_id,character_b_id',
        });

      if (!relError) {
        relationshipsUpdated.push({
          from: rel.characterAName,
          to: rel.characterBName,
          type: rel.relationshipType,
        });
      }
    }

    // 7. 기존 캐릭터 last_appearance_episode 업데이트
    for (const mention of extractionResult.existingCharacterMentions) {
      const char = (existingCharacters || []).find(c => c.name === mention.name);
      if (char) {
        await supabase
          .from('characters')
          .update({ last_appearance_episode: episode.episode_number })
          .eq('id', char.id);
      }
    }

    return NextResponse.json({
      success: true,
      result: {
        newCharactersSaved: savedCharacters.length,
        newCharacters: savedCharacters.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
        })),
        relationshipsUpdated: relationshipsUpdated.length,
        relationships: relationshipsUpdated,
        existingCharactersMentioned: extractionResult.existingCharacterMentions.length,
      },
    });
  } catch (error) {
    console.error('[ExtractCharacters] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Character extraction failed' },
      { status: 500 }
    );
  }
}

/**
 * 관계 유형 매핑
 */
function mapRelationshipType(type: string): string {
  const mapping: Record<string, string> = {
    ally: 'ally',
    enemy: 'enemy',
    neutral: 'neutral',
    family: 'family',
    romantic: 'romantic',
    mentor: 'mentor',
    rival: 'rival',
    complex: 'unknown',
    target: 'enemy',
    protector: 'ally',
  };
  return mapping[type.toLowerCase()] || 'neutral';
}
