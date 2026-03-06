/**
 * Character Extractor - 에피소드에서 새로운 캐릭터를 자동 추출
 *
 * 에피소드 생성/채택 후 백그라운드에서 실행되어:
 * 1. 텍스트에서 새롭게 언급된 인물 감지
 * 2. 이름, 외형, 소속, 행동, 관계성 분석
 * 3. DB에 임시 프로필(Draft)로 저장
 */

import { generateCompletion } from '@/lib/ai/claude-client';

export interface ExtractedCharacter {
  name: string;
  nickname?: string;
  appearance?: string;
  affiliation?: string;
  firstAction: string;
  relationshipToProtagonist: 'ally' | 'enemy' | 'neutral' | 'unknown';
  estimatedRole: 'extra' | 'supporting' | 'antagonist';
  confidence: number; // 0-1, 추출 신뢰도
  mentionCount: number;
  quotes: string[]; // 해당 인물의 대사들
}

export interface CharacterExtractionResult {
  newCharacters: ExtractedCharacter[];
  existingCharacterMentions: {
    characterId: string;
    name: string;
    mentionCount: number;
    newActions: string[];
  }[];
  relationshipUpdates: {
    characterAName: string;
    characterBName: string;
    relationshipType: string;
    description: string;
    intensity: number;
  }[];
}

/**
 * 에피소드 텍스트에서 캐릭터 정보 추출
 */
export async function extractCharactersFromEpisode(
  episodeContent: string,
  episodeNumber: number,
  existingCharacterNames: string[],
  protagonistName: string,
  useMock: boolean = false
): Promise<CharacterExtractionResult> {
  if (useMock) {
    return generateMockExtractionResult(episodeContent, existingCharacterNames);
  }

  const prompt = buildExtractionPrompt(
    episodeContent,
    episodeNumber,
    existingCharacterNames,
    protagonistName
  );

  try {
    const response = await generateCompletion({
      systemPrompt: CHARACTER_EXTRACTION_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: 4096,
      temperature: 0.3, // 낮은 온도로 정확한 추출
    });

    return parseExtractionResponse(response.text);
  } catch (error) {
    console.error('[CharacterExtractor] AI 추출 실패:', error);
    // 실패 시 규칙 기반 추출로 폴백
    return fallbackExtraction(episodeContent, existingCharacterNames);
  }
}

const CHARACTER_EXTRACTION_SYSTEM_PROMPT = `당신은 웹소설 텍스트 분석 전문가입니다.
주어진 에피소드 텍스트를 분석하여 등장하는 인물들의 정보를 추출합니다.

## 추출 규칙

1. **새로운 인물 감지**
   - 이름이 명시적으로 언급된 인물만 추출 (대명사 제외)
   - "그 남자", "노인" 등 지칭어는 이름이 있을 때만 연결
   - 기존 등록된 캐릭터 목록에 없는 인물만 "새 인물"로 분류

2. **정보 추출 항목**
   - name: 정식 이름 또는 호칭
   - nickname: 별명, 별호가 있다면
   - appearance: 외형 묘사 (언급된 경우만)
   - affiliation: 소속 문파/조직/집단
   - firstAction: 첫 등장 시 행동 요약 (1문장)
   - relationshipToProtagonist: 주인공과의 관계 (ally/enemy/neutral/unknown)
   - estimatedRole: 예상 역할 (extra/supporting/antagonist)
   - confidence: 추출 신뢰도 0~1
   - quotes: 해당 인물의 대사들 (최대 3개)

3. **관계 분석**
   - 인물 간 상호작용에서 관계 유형 파악
   - intensity: 관계 강도 1~10

## 출력 형식
반드시 아래 JSON 형식으로만 응답:
\`\`\`json
{
  "newCharacters": [...],
  "existingCharacterMentions": [...],
  "relationshipUpdates": [...]
}
\`\`\``;

function buildExtractionPrompt(
  content: string,
  episodeNumber: number,
  existingNames: string[],
  protagonistName: string
): string {
  return `## 분석 대상
- 에피소드 번호: ${episodeNumber}화
- 주인공 이름: ${protagonistName}
- 기존 등록된 캐릭터: ${existingNames.length > 0 ? existingNames.join(', ') : '없음'}

## 에피소드 텍스트
"""
${content}
"""

위 텍스트를 분석하여 새로운 인물, 기존 인물의 활동, 관계 변화를 JSON으로 추출하세요.`;
}

function parseExtractionResponse(response: string): CharacterExtractionResult {
  try {
    // JSON 블록 추출
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;

    const parsed = JSON.parse(jsonStr);

    return {
      newCharacters: (parsed.newCharacters || []).map((char: ExtractedCharacter) => ({
        ...char,
        confidence: Math.min(1, Math.max(0, char.confidence || 0.5)),
        mentionCount: char.mentionCount || 1,
        quotes: char.quotes || [],
      })),
      existingCharacterMentions: parsed.existingCharacterMentions || [],
      relationshipUpdates: parsed.relationshipUpdates || [],
    };
  } catch (error) {
    console.error('[CharacterExtractor] JSON 파싱 실패:', error);
    return {
      newCharacters: [],
      existingCharacterMentions: [],
      relationshipUpdates: [],
    };
  }
}

/**
 * 규칙 기반 폴백 추출 (AI 실패 시)
 */
function fallbackExtraction(
  content: string,
  existingNames: string[]
): CharacterExtractionResult {
  const newCharacters: ExtractedCharacter[] = [];

  // 한글 이름 패턴 (2-4글자)
  const namePattern = /[가-힣]{2,4}(?:이|가|은|는|을|를|의|와|과|에게|한테|라고|이라고)/g;
  const matches = content.match(namePattern) || [];

  const nameCounts = new Map<string, number>();

  matches.forEach(match => {
    // 조사 제거
    const name = match.replace(/(?:이|가|은|는|을|를|의|와|과|에게|한테|라고|이라고)$/, '');
    if (name.length >= 2 && !existingNames.includes(name)) {
      nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    }
  });

  // 2회 이상 언급된 이름만 추출
  nameCounts.forEach((count, name) => {
    if (count >= 2) {
      newCharacters.push({
        name,
        firstAction: `${name}(이)가 텍스트에서 ${count}회 언급됨`,
        relationshipToProtagonist: 'unknown',
        estimatedRole: 'extra',
        confidence: 0.4, // 규칙 기반은 신뢰도 낮음
        mentionCount: count,
        quotes: [],
      });
    }
  });

  return {
    newCharacters,
    existingCharacterMentions: [],
    relationshipUpdates: [],
  };
}

/**
 * Mock 데이터 생성 (테스트용)
 */
function generateMockExtractionResult(
  content: string,
  existingNames: string[]
): CharacterExtractionResult {
  // 간단한 이름 추출 시뮬레이션
  const mockNames = ['최태민', '박서준', '이현아'];
  const newCharacters: ExtractedCharacter[] = [];

  mockNames.forEach(name => {
    if (content.includes(name) && !existingNames.includes(name)) {
      newCharacters.push({
        name,
        appearance: '중년의 남성' + (Math.random() > 0.5 ? ', 날카로운 눈매' : ''),
        affiliation: Math.random() > 0.5 ? '신성물산' : undefined,
        firstAction: `${name}이 처음 등장하여 주인공과 대면함`,
        relationshipToProtagonist: Math.random() > 0.5 ? 'enemy' : 'neutral',
        estimatedRole: 'extra',
        confidence: 0.8,
        mentionCount: Math.floor(Math.random() * 5) + 1,
        quotes: [`"흥미롭군."`],
      });
    }
  });

  return {
    newCharacters,
    existingCharacterMentions: [],
    relationshipUpdates: [
      {
        characterAName: '진우',
        characterBName: '소민',
        relationshipType: 'complex',
        description: '타겟이지만 알 수 없는 끌림',
        intensity: 7,
      }
    ],
  };
}

/**
 * 추출된 캐릭터를 DB에 저장하기 위한 형식으로 변환
 */
export function convertToDbFormat(
  extracted: ExtractedCharacter,
  projectId: string,
  episodeId: string,
  episodeNumber: number
) {
  return {
    project_id: projectId,
    name: extracted.name,
    role: extracted.estimatedRole === 'antagonist' ? 'antagonist' : 'extra',
    appearance: extracted.appearance || null,
    personality: null,
    speech_pattern: extracted.quotes.length > 0
      ? `대사 샘플: ${extracted.quotes.join(' / ')}`
      : null,
    backstory: extracted.affiliation
      ? `소속: ${extracted.affiliation}`
      : null,
    goals: [],
    is_alive: true,
    current_location: null,
    emotional_state: 'neutral',
    possessed_items: [],
    injuries: [],
    status_effects: [],
    additional_data: {
      is_auto_extracted: true,
      extraction_confidence: extracted.confidence,
      first_action: extracted.firstAction,
      initial_relationship: extracted.relationshipToProtagonist,
      mention_count: extracted.mentionCount,
      tier: 3, // 엑스트라 = Tier 3
    },
    first_appearance_episode: episodeNumber,
    last_appearance_episode: episodeNumber,
  };
}

/**
 * 캐릭터 티어 정의
 */
export const CHARACTER_TIERS = {
  1: {
    name: '서브 주인공',
    nameEn: 'Sub Protagonist',
    description: '메인 플롯에 깊이 개입하는 핵심 인물',
    promptWeight: 'high',
    color: 'gold',
  },
  2: {
    name: '주요 조연',
    nameEn: 'Major Supporting',
    description: '중요한 서브플롯을 이끄는 인물',
    promptWeight: 'medium',
    color: 'silver',
  },
  3: {
    name: '엑스트라',
    nameEn: 'Extra',
    description: '배경 인물, 필요시 등급 상향 가능',
    promptWeight: 'low',
    color: 'bronze',
  },
} as const;

export type CharacterTier = keyof typeof CHARACTER_TIERS;
