import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { CHARACTER_TIERS, CharacterTier } from '@/core/memory/character-extractor';

interface RouteParams {
  params: Promise<{ projectId: string; characterId: string }>;
}

/**
 * PATCH /api/projects/[projectId]/characters/[characterId]/upgrade
 *
 * 캐릭터 등급(Tier) 변경
 * - Tier 1: 서브 주인공 (메인 플롯 깊이 개입)
 * - Tier 2: 주요 조연 (서브플롯 담당)
 * - Tier 3: 엑스트라 (배경 인물)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, characterId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { tier, role } = body;

    // Tier 유효성 검사
    if (tier !== undefined && ![1, 2, 3].includes(tier)) {
      return NextResponse.json(
        { error: 'Invalid tier. Must be 1, 2, or 3' },
        { status: 400 }
      );
    }

    // 캐릭터 조회
    const { data: character, error: fetchError } = await supabase
      .from('characters')
      .select('*')
      .eq('id', characterId)
      .eq('project_id', projectId)
      .single();

    if (fetchError || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    // 업데이트 데이터 구성
    const additionalData = (character.additional_data as Record<string, unknown>) || {};
    const oldTier = (additionalData.tier as number) || 3;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Tier 변경 시 additional_data 업데이트
    if (tier !== undefined) {
      additionalData.tier = tier;
      additionalData.tier_upgraded_at = new Date().toISOString();
      additionalData.previous_tier = oldTier;
      updateData.additional_data = additionalData;

      // Tier에 따른 role 자동 설정
      if (tier === 1) {
        updateData.role = 'supporting'; // 서브 주인공
      } else if (tier === 2) {
        updateData.role = 'supporting'; // 주요 조연
      } else if (tier === 3) {
        updateData.role = 'extra'; // 엑스트라
      }
    }

    // role 직접 변경 (선택적)
    if (role !== undefined) {
      if (!['protagonist', 'antagonist', 'supporting', 'extra'].includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }
      updateData.role = role;
    }

    // DB 업데이트
    const { data: updated, error: updateError } = await supabase
      .from('characters')
      .update(updateData)
      .eq('id', characterId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    const newTier = (updated.additional_data as Record<string, unknown>)?.tier || 3;
    const tierInfo = CHARACTER_TIERS[newTier as CharacterTier];

    console.log(`[CharacterUpgrade] ${character.name}: Tier ${oldTier} → Tier ${newTier}`);

    return NextResponse.json({
      success: true,
      character: updated,
      tierChange: {
        from: oldTier,
        to: newTier,
        tierName: tierInfo?.name || '알 수 없음',
        promptWeight: tierInfo?.promptWeight || 'low',
      },
      message: `${character.name}의 등급이 ${tierInfo?.name || `Tier ${newTier}`}(으)로 변경되었습니다.`,
    });
  } catch (error) {
    console.error('[CharacterUpgrade] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upgrade failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/[projectId]/characters/[characterId]/upgrade
 *
 * 캐릭터의 현재 등급 정보 조회
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, characterId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { data: character, error } = await supabase
      .from('characters')
      .select('id, name, role, additional_data')
      .eq('id', characterId)
      .eq('project_id', projectId)
      .single();

    if (error || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const additionalData = character.additional_data as Record<string, unknown> || {};
    const currentTier = (additionalData.tier as number) || 3;
    const tierInfo = CHARACTER_TIERS[currentTier as CharacterTier];

    return NextResponse.json({
      characterId: character.id,
      name: character.name,
      currentTier,
      tierInfo: {
        name: tierInfo?.name,
        description: tierInfo?.description,
        promptWeight: tierInfo?.promptWeight,
        color: tierInfo?.color,
      },
      isAutoExtracted: additionalData.is_auto_extracted || false,
      extractionConfidence: additionalData.extraction_confidence,
      availableTiers: Object.entries(CHARACTER_TIERS).map(([tier, info]) => ({
        tier: Number(tier),
        ...info,
      })),
    });
  } catch (error) {
    console.error('[CharacterUpgrade] GET 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get tier info' },
      { status: 500 }
    );
  }
}
