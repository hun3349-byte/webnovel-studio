// ============================================================================
// Style Injector - 동적 STYLE_DNA 프롬프트 생성
// ============================================================================

import type { MergedStyleDNA, BestSample } from '@/types/style-dna';
import { getMergedDNA } from './style-dna-manager';

// ============================================================================
// 기본 STYLE_DNA (DNA가 없을 때 Fallback)
// ============================================================================
const DEFAULT_STYLE_DNA = `
<style_dna version="default">
[서술 원칙]
- Show, Don't Tell. 감정을 직접 쓰지 말고 '신체 반응'으로 보여줘라.
- 대사 비율은 전체의 25% 이하.
- 모든 씬에 '갈등(Conflict)'이 있어야 한다.

[문장 호흡 — 스타카토 금지, 복문 연결 필수]
- 같은 흐름의 동작/감각은 접속사(~하자, ~하며, ~하고)로 연결하여 호흡을 길게.
- 짧은 문장(1~3어절)이 3개 이상 연속되면 안 된다.

× (스타카토 금지): 검을 뽑았다. 달려들었다. 베었다.
○ (복문 권장): 검을 뽑아 달려들며 베어내자 붉은 피가 허공에 선을 그었다.

[문단 구분 — 흐름이 바뀔 때만 빈 줄]
- 문단은 2~4문장으로 구성.
- 한 문장짜리 문단은 극적 강조 시에만 (1화에 최대 3회).
- 빈 줄: 시선/시간/장소/분위기 전환 시에만 사용.

[대사 포매팅]
- 대사(" ")는 앞뒤로 빈 줄을 넣어 시각적으로 독립.

[감정 표현]
- 감정을 직접 서술하지 말고 신체 반응으로 표현.
- 떨림, 구역질, 심장 박동, 식은땀, 호흡 변화 등 활용.
</style_dna>
`;

// ============================================================================
// 동적 STYLE_DNA 생성
// ============================================================================

/**
 * 프로젝트의 합성 DNA를 기반으로 동적 STYLE_DNA 섹션 생성
 * 하드코딩된 STYLE_DNA를 대체
 */
export async function buildDynamicStyleDNA(projectId: string): Promise<string> {
  try {
    const mergedDNA = await getMergedDNA(projectId);

    if (!mergedDNA) {
      console.log('[StyleInjector] No merged DNA found, using default');
      return DEFAULT_STYLE_DNA;
    }

    return formatMergedDNAToPrompt(mergedDNA);
  } catch (error) {
    console.error('[StyleInjector] Failed to load merged DNA:', error);
    return DEFAULT_STYLE_DNA;
  }
}

/**
 * MergedStyleDNA를 프롬프트 형식으로 변환
 */
function formatMergedDNAToPrompt(dna: MergedStyleDNA): string {
  const sections: string[] = [];

  sections.push(`<style_dna version="${dna.version}" sources="${dna.sourceCount}">`);

  // 헤더
  const sourceInfo = [];
  if (dna.referenceCount > 0) sourceInfo.push(`레퍼런스 ${dna.referenceCount}편`);
  if (dna.pdFeedbackCount > 0) sourceInfo.push(`PD 피드백 ${dna.pdFeedbackCount}회`);
  sections.push(`[합성된 문체 DNA - ${sourceInfo.join(' + ')}]`);
  sections.push('');

  // 문체 특성
  if (dna.proseStyle) {
    sections.push(`[문체 특성]`);
    sections.push(dna.proseStyle);
    sections.push('');
  }

  // 리듬 패턴
  if (dna.rhythmPattern) {
    sections.push(`[리듬 패턴]`);
    sections.push(dna.rhythmPattern);
    sections.push('');
  }

  // 대화체 스타일
  if (dna.dialogueStyle) {
    sections.push(`[대화체]`);
    sections.push(dna.dialogueStyle);
    sections.push('');
  }

  // 감정 표현
  if (dna.emotionExpression) {
    sections.push(`[감정 표현]`);
    sections.push(dna.emotionExpression);
    sections.push('');
  }

  // 장면 전환
  if (dna.sceneTransition) {
    sections.push(`[장면 전환]`);
    sections.push(dna.sceneTransition);
    sections.push('');
  }

  // 액션 묘사
  if (dna.actionDescription) {
    sections.push(`[액션/전투 묘사]`);
    sections.push(dna.actionDescription);
    sections.push('');
  }

  // 모범 예시
  if (dna.bestSamples && dna.bestSamples.length > 0) {
    sections.push(`[모범 예시 — 이런 식으로 써라]`);
    dna.bestSamples.forEach((sample, i) => {
      if (sample.badExample) {
        sections.push(`× (금지): ${sample.badExample}`);
      }
      sections.push(`○ (권장): ${sample.goodExample}`);
      if (sample.explanation) {
        sections.push(`  → ${sample.explanation}`);
      }
      if (i < dna.bestSamples.length - 1) sections.push('');
    });
    sections.push('');
  }

  // 금지 패턴
  if (dna.avoidPatterns && dna.avoidPatterns.length > 0) {
    sections.push(`[금지 패턴 — 절대 사용하지 마라]`);
    dna.avoidPatterns.forEach(p => sections.push(`- ❌ ${p}`));
    sections.push('');
  }

  // 권장 패턴
  if (dna.favorPatterns && dna.favorPatterns.length > 0) {
    sections.push(`[권장 패턴 — 적극 활용하라]`);
    dna.favorPatterns.forEach(p => sections.push(`- ✅ ${p}`));
  }

  sections.push(`</style_dna>`);

  return sections.join('\n');
}

/**
 * 기본 STYLE_DNA 반환 (DNA가 없을 때)
 */
export function getDefaultStyleDNA(): string {
  return DEFAULT_STYLE_DNA;
}

/**
 * StyleDNA 존재 여부 확인
 */
export async function hasStyleDNA(projectId: string): Promise<boolean> {
  try {
    const mergedDNA = await getMergedDNA(projectId);
    return mergedDNA !== null;
  } catch {
    return false;
  }
}
