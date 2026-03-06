import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/characters/fix-tiers
 *
 * 오염된 캐릭터 Tier 데이터 복구
 * - protagonist(주인공) → Tier 1 강제
 * - antagonist(빌런) → Tier 1 강제
 * - supporting(조연) → Tier 2 (기존 Tier 3인 경우)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const supabase = await createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    // 프로젝트의 모든 캐릭터 조회
    const { data: characters, error: fetchError } = await supabase
      .from('characters')
      .select('id, name, role, additional_data')
      .eq('project_id', projectId);

    if (fetchError) throw fetchError;

    const fixed: string[] = [];
    const skipped: string[] = [];

    for (const char of characters || []) {
      const additionalData = (char.additional_data as Record<string, unknown>) || {};
      const currentTier = (additionalData.tier as number) || 3;

      let newTier: number | null = null;

      // 역할에 따른 Tier 강제 복구
      if (char.role === 'protagonist') {
        if (currentTier !== 1) {
          newTier = 1;
        }
      } else if (char.role === 'antagonist') {
        if (currentTier !== 1) {
          newTier = 1;
        }
      } else if (char.role === 'supporting') {
        if (currentTier === 3) {
          // supporting이 Tier 3이면 Tier 2로 격상 (선택적)
          // 원래 supporting이면 Tier 2가 적절
          newTier = 2;
        }
      }
      // extra 역할은 Tier 3 유지

      if (newTier !== null) {
        // Tier 업데이트
        const updatedAdditionalData = {
          ...additionalData,
          tier: newTier,
          tier_fixed_at: new Date().toISOString(),
          tier_fixed_from: currentTier,
          tier_locked: char.role === 'protagonist' || char.role === 'antagonist',
        };

        const { error: updateError } = await supabase
          .from('characters')
          .update({ additional_data: updatedAdditionalData })
          .eq('id', char.id);

        if (!updateError) {
          fixed.push(`${char.name}: Tier ${currentTier} → Tier ${newTier} (${char.role})`);
          console.log(`[FixTiers] ✅ 복구됨: ${char.name} (${char.role}): Tier ${currentTier} → Tier ${newTier}`);
        }
      } else {
        skipped.push(`${char.name}: Tier ${currentTier} (${char.role}) - 정상`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${fixed.length}명의 캐릭터 Tier가 복구되었습니다.`,
      fixed,
      skipped,
      totalCharacters: characters?.length || 0,
    });
  } catch (error) {
    console.error('[FixTiers] 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Tier fix failed' },
      { status: 500 }
    );
  }
}
