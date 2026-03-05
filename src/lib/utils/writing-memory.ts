// ============================================================================
// Writing Memory - 문체 학습 및 스타일 규칙 관리
// ============================================================================
// 고신뢰도 스타일 규칙을 프롬프트에 주입하는 시스템
// confidence 100 = [필수 규칙], 80+ = [권장 규칙], 그 외 = [참고 규칙]
// ============================================================================

import type { WritingPreference } from '@/types/memory';

/**
 * 스타일 규칙 (WritingPreference 확장)
 */
export interface StyleRule extends Omit<WritingPreference, 'feedbackType'> {
  id: string;
  name: string;
  category: 'pacing' | 'description' | 'style' | 'character' | 'structure' | 'tone' | 'dialogue';
  rule: string;
  examples: {
    bad?: string;
    good: string;
  }[];
  confidence: number; // 0-100
  isSystemRule: boolean; // 시스템 기본 규칙 여부
  createdAt: string;
}

/**
 * 시스템 기본 스타일 규칙 (confidence 100 = 필수)
 * v1.0 - 김 이사 피드백 기반 핵심 4가지 규칙
 */
export const SYSTEM_STYLE_RULES: StyleRule[] = [
  // =========================================================================
  // [Rule 1] 오감(五感)을 활용한 텐션 빌드업
  // =========================================================================
  {
    id: 'SYSTEM_RULE_001',
    name: '오감(五感)을 활용한 텐션 빌드업',
    category: 'pacing',
    rule: '적이나 위협이 등장할 때 절대 갑자기 시각적으로 튀어나오게 묘사하지 마라. 반드시 후각, 청각, 촉각을 먼저 자극하며 긴장감을 쌓아 올려라.',
    preferenceSummary: '위협 등장 시 오감 빌드업 필수',
    avoidPatterns: [
      '"갑자기 ~가 나타났다"',
      '"그때, 누군가 나타났다"',
      '빌드업 없이 적이 시각적으로 튀어나오는 연출',
    ],
    favorPatterns: [
      '후각 → 청각 → 촉각 → 시각 순서의 점진적 긴장감 고조',
      '냄새나 소리로 먼저 기척을 전달',
      '신체 반응(소름, 땀, 심장박동)으로 위험 감지 표현',
    ],
    examples: [
      {
        bad: '갑자기 앞을 가로막는 자들이 나타났다.',
        good: '코끝을 스치는 냄새에 발걸음이 멎었다. 누룩 냄새. 그리고 묵은 땀내. 목덜미의 솜털이 곤두섰다. 스르륵— 앞쪽 수풀이 갈라지며 쇠붙이가 스치는 소리가 났다.',
      },
    ],
    confidence: 100,
    isSystemRule: true,
    createdAt: new Date().toISOString(),
  },

  // =========================================================================
  // [Rule 2] 전투 씬의 압도적 무게감 묘사
  // =========================================================================
  {
    id: 'SYSTEM_RULE_002',
    name: '전투 씬의 압도적 무게감 묘사',
    category: 'description',
    rule: '무기가 부딪히는 전투 씬에서는 단순한 의성어(창!)로 넘기지 마라. 무기의 무게감, 뼈와 근육으로 전해지는 충격, 피가 튀는 감촉 등 묵직하고 생생한 물리적 타격감을 서술해라.',
    preferenceSummary: '전투 씬에서 물리적 타격감 필수 묘사',
    avoidPatterns: [
      '"창!" "쨍!" 등 의성어만 있는 전투 묘사',
      '충격이나 고통 없이 스쳐 지나가는 액션',
      '무게감 없는 가벼운 무술 연출',
    ],
    favorPatterns: [
      '충격이 뼈와 근육을 타고 전해지는 묘사',
      '피가 튀는 감촉, 살이 베이는 느낌',
      '무기의 무게가 신체에 미치는 영향',
      '호흡과 심장박동의 변화',
    ],
    examples: [
      {
        bad: '창! 검이 도끼를 받아쳤다.',
        good: '충격이 손목을 타고 어깨까지 찌르르 전해졌다. 청운의 이가 맞부딪쳤다. 도끼의 무게가 상상 이상이었다.',
      },
      {
        good: '살을 가르는 감촉이 검을 통해 전해졌다. 뜨거운 것이 청운의 뺨에 튀었다.',
      },
    ],
    confidence: 100,
    isSystemRule: true,
    createdAt: new Date().toISOString(),
  },

  // =========================================================================
  // [Rule 3] 변화와 성장의 간접 묘사 (Show, Don't Tell)
  // =========================================================================
  {
    id: 'SYSTEM_RULE_003',
    name: '변화와 성장의 간접 묘사 (Show, Don\'t Tell)',
    category: 'character',
    rule: '캐릭터의 내면이나 성격이 변했다는 것을 서술자로써 직접 설명("내면이 변해 있었다")하지 마라. 행동, 손떨림, 생리적 반응(구역질 억누름) 등을 통해 독자가 그 변화를 직접 느끼게 보여줘라.',
    preferenceSummary: '캐릭터 변화는 행동과 신체 반응으로만 표현',
    avoidPatterns: [
      '"그의 내면에는 무언가가 변해 있었다"',
      '"평소의 그라면 상상할 수 없는 ~였다"',
      '서술자가 캐릭터의 변화를 직접 설명',
      '"그는 달라져 있었다" 류의 직접 서술',
    ],
    favorPatterns: [
      '행동의 변화로 내면 변화 암시',
      '손떨림, 호흡, 땀 등 생리적 반응',
      '구역질을 삼키는 등 자기 통제 묘사',
      '과거와 현재 행동의 대비',
    ],
    examples: [
      {
        bad: '평소의 청운이라면 상상할 수 없는 어조. 스승님과 사형들의 죽음을 목격한 후, 그의 내면에는 무언가가 변해 있었다.',
        good: '손을 들어 뺨에 묻은 것을 닦았다. 손등에 선명한 핏자국. 남의 피였다. 구역질이 올라왔다. 하지만 삼켰다.',
      },
    ],
    confidence: 100,
    isSystemRule: true,
    createdAt: new Date().toISOString(),
  },

  // =========================================================================
  // [Rule 4] 입체적인 기인/절대자 등장 연출
  // =========================================================================
  {
    id: 'SYSTEM_RULE_004',
    name: '입체적인 기인/절대자 등장 연출',
    category: 'structure',
    rule: '압도적인 무력을 가진 자가 등장할 때 박수를 치거나 갑자기 허공에서 나타나는 낡은 클리셰를 피하라. 주인공의 감각이 예민해졌을 때 비로소 "원래부터 거기 있었던" 압도적인 기척을 깨닫는 방식으로 연출해라.',
    preferenceSummary: '강자 등장 시 "이미 거기 있었다" 연출 필수',
    avoidPatterns: [
      '"짝. 짝. 짝. 박수를 치며 나타나는 기인"',
      '"호오, 제법이군" 류의 진부한 첫마디',
      '갑자기 허공이나 나무 위에서 등장',
      '전투 직후 느닷없이 나타나는 신비로운 고수',
    ],
    favorPatterns: [
      '"처음부터 거기 있었던 건가?" 류의 인지',
      '전투 후 고양된 감각으로 비로소 기척을 눈치챔',
      '희미한 숨소리, 그림자 속 생명의 파동',
      '공포와 경외심이 뒤섞인 첫 대면',
    ],
    examples: [
      {
        bad: '짝. 짝. 짝. 어둠 속에서 박수 소리가 울렸다. "호오, 제법이군."',
        good: '희미한 숨소리. 아니, 숨소리라기보다는 기척에 가까웠다. 그림자 속에 묻혀 있던, 아주 미세한 생명의 파동. "...처음부터 거기 있었던 건가?"',
      },
    ],
    confidence: 100,
    isSystemRule: true,
    createdAt: new Date().toISOString(),
  },
];

/**
 * 신뢰도에 따른 규칙 등급 분류
 */
export function getRuleGrade(confidence: number): '필수' | '권장' | '참고' {
  if (confidence >= 100) return '필수';
  if (confidence >= 80) return '권장';
  return '참고';
}

/**
 * Writing Memory 프롬프트 빌더
 * 신뢰도 순으로 정렬하여 [필수 규칙]을 최상단에 배치
 */
export function buildWritingMemoryPrompt(
  userRules: StyleRule[] = [],
  includeSystemRules: boolean = true
): string {
  // 시스템 규칙 + 사용자 규칙 병합
  const allRules = includeSystemRules
    ? [...SYSTEM_STYLE_RULES, ...userRules]
    : userRules;

  if (allRules.length === 0) return '';

  // 신뢰도 내림차순 정렬
  const sortedRules = [...allRules].sort((a, b) => b.confidence - a.confidence);

  // 등급별 그룹화
  const requiredRules = sortedRules.filter(r => r.confidence >= 100);
  const recommendedRules = sortedRules.filter(r => r.confidence >= 80 && r.confidence < 100);
  const referenceRules = sortedRules.filter(r => r.confidence < 80);

  const sections: string[] = [];

  // [필수 규칙] 섹션
  if (requiredRules.length > 0) {
    const rulesText = requiredRules.map((rule, idx) => formatRuleForPrompt(rule, idx + 1)).join('\n\n');
    sections.push(`
【필수 규칙 - 반드시 준수】
${rulesText}`);
  }

  // [권장 규칙] 섹션
  if (recommendedRules.length > 0) {
    const rulesText = recommendedRules.map((rule, idx) => formatRuleForPrompt(rule, idx + 1)).join('\n\n');
    sections.push(`
【권장 규칙 - 가급적 준수】
${rulesText}`);
  }

  // [참고 규칙] 섹션
  if (referenceRules.length > 0) {
    const rulesText = referenceRules.map((rule, idx) => formatRuleForPrompt(rule, idx + 1)).join('\n\n');
    sections.push(`
【참고 규칙 - 상황에 맞게 적용】
${rulesText}`);
  }

  return `
═══════════════════════════════════════════════════════════════════════════════
                    ★★★ 학습된 문체 규칙 (Writing Memory) ★★★
═══════════════════════════════════════════════════════════════════════════════
${sections.join('\n')}
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * 단일 규칙을 프롬프트 형식으로 포맷
 */
function formatRuleForPrompt(rule: StyleRule, index: number): string {
  const lines: string[] = [];

  lines.push(`[${index}] ${rule.name}`);
  lines.push(`   📌 ${rule.rule}`);

  // 회피 패턴
  if (rule.avoidPatterns && rule.avoidPatterns.length > 0) {
    lines.push(`   ❌ 금지: ${rule.avoidPatterns.slice(0, 2).join(' / ')}`);
  }

  // 선호 패턴
  if (rule.favorPatterns && rule.favorPatterns.length > 0) {
    lines.push(`   ✅ 권장: ${rule.favorPatterns.slice(0, 2).join(' / ')}`);
  }

  // 모범 예시 (첫 번째만)
  if (rule.examples && rule.examples.length > 0) {
    const ex = rule.examples[0];
    if (ex.bad) {
      lines.push(`   ❌ Bad: "${ex.bad.substring(0, 50)}${ex.bad.length > 50 ? '...' : ''}"`);
    }
    lines.push(`   ✅ Good: "${ex.good.substring(0, 80)}${ex.good.length > 80 ? '...' : ''}"`);
  }

  return lines.join('\n');
}

/**
 * WritingPreference를 StyleRule로 변환
 */
export function convertPreferenceToStyleRule(
  pref: WritingPreference,
  id: string
): StyleRule {
  return {
    id,
    name: pref.preferenceSummary || `규칙 ${id}`,
    category: mapFeedbackTypeToCategory(pref.feedbackType),
    rule: pref.preferenceSummary || '',
    preferenceSummary: pref.preferenceSummary,
    avoidPatterns: pref.avoidPatterns,
    favorPatterns: pref.favorPatterns,
    examples: [],
    confidence: pref.confidence,
    isSystemRule: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * feedback_type을 category로 매핑
 */
function mapFeedbackTypeToCategory(
  feedbackType: string
): StyleRule['category'] {
  const mapping: Record<string, StyleRule['category']> = {
    style: 'style',
    vocabulary: 'style',
    pacing: 'pacing',
    dialogue: 'dialogue',
    description: 'description',
    structure: 'structure',
  };
  return mapping[feedbackType] || 'style';
}

/**
 * 시스템 규칙 ID 목록 가져오기
 */
export function getSystemRuleIds(): string[] {
  return SYSTEM_STYLE_RULES.map(r => r.id);
}

/**
 * ID로 시스템 규칙 조회
 */
export function getSystemRuleById(id: string): StyleRule | undefined {
  return SYSTEM_STYLE_RULES.find(r => r.id === id);
}

/**
 * 카테고리별 시스템 규칙 조회
 */
export function getSystemRulesByCategory(category: StyleRule['category']): StyleRule[] {
  return SYSTEM_STYLE_RULES.filter(r => r.category === category);
}

// ============================================================================
// 콘솔 확인용: 주입된 규칙 출력
// ============================================================================
export function logInjectedRules(): void {
  console.log('\n========================================');
  console.log('✅ 스타일 규칙 영구 학습 완료');
  console.log('========================================');
  console.log(`총 ${SYSTEM_STYLE_RULES.length}개 규칙 (confidence: 100)`);
  SYSTEM_STYLE_RULES.forEach((rule, idx) => {
    console.log(`\n[${idx + 1}] ${rule.name}`);
    console.log(`    카테고리: ${rule.category}`);
    console.log(`    신뢰도: ${rule.confidence} (${getRuleGrade(rule.confidence)} 규칙)`);
  });
  console.log('\n========================================\n');
}
