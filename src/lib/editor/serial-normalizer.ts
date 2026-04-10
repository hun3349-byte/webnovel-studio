function splitParagraphs(text: string): string[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function sentenceCount(paragraph: string): number {
  const matches = paragraph.match(/[.!?…]/g);
  return matches ? matches.length : 0;
}

function isSceneBreak(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  return trimmed === '* * *' || /^[-=]{3,}$/.test(trimmed);
}

function isDialogueOnly(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  return /^[\"'“”‘’「『].+[\"'“”‘’」』]$/.test(trimmed);
}

function isShortNarrative(paragraph: string): boolean {
  const trimmed = paragraph.trim();
  if (!trimmed || isDialogueOnly(trimmed)) return false;
  return trimmed.length <= 70 && sentenceCount(trimmed) <= 2;
}

function endsAsClosedSentence(paragraph: string): boolean {
  return /[.!?…)"'\]}」』]$/.test(paragraph.trim());
}

function shouldMerge(previous: string | undefined, current: string): boolean {
  if (!previous || !current) return false;
  if (isSceneBreak(previous) || isSceneBreak(current)) return false;

  if (!endsAsClosedSentence(previous)) return true;
  if (isDialogueOnly(previous) && isShortNarrative(current)) return true;
  if (isShortNarrative(previous) && isDialogueOnly(current)) return true;
  if (isShortNarrative(previous) || isShortNarrative(current)) return true;
  if (sentenceCount(previous) <= 1 && sentenceCount(current) <= 1) return true;

  return false;
}

function joinParagraphs(previous: string, current: string): string {
  const left = previous.trimEnd();
  const right = current.trimStart();
  if (!left) return right;
  if (!right) return left;

  const noSpaceAfter = /[("'\[{“‘「『]$/.test(left);
  const noSpaceBefore = /^[,.;:!?…\]"'”’」』]/.test(right);

  return `${left}${noSpaceAfter || noSpaceBefore ? '' : ' '}${right}`
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForSimilarity(paragraph: string): string {
  return paragraph
    .toLowerCase()
    .replace(/[^0-9a-z\uac00-\ud7a3\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toWordSet(text: string): Set<string> {
  return new Set(text.split(' ').filter((token) => token.length >= 2));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function toBigrams(text: string): string[] {
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 2) return [compact];
  const result: string[] = [];
  for (let i = 0; i < compact.length - 1; i += 1) {
    result.push(compact.slice(i, i + 2));
  }
  return result;
}

function diceSimilarity(a: string, b: string): number {
  const biA = toBigrams(a);
  const biB = toBigrams(b);
  if (!biA.length || !biB.length) return 0;

  const freq = new Map<string, number>();
  for (const unit of biA) {
    freq.set(unit, (freq.get(unit) || 0) + 1);
  }

  let intersection = 0;
  for (const unit of biB) {
    const count = freq.get(unit) || 0;
    if (count > 0) {
      intersection += 1;
      freq.set(unit, count - 1);
    }
  }

  return (2 * intersection) / (biA.length + biB.length);
}

function areParagraphsSimilar(a: string, b: string): boolean {
  const normA = normalizeForSimilarity(a);
  const normB = normalizeForSimilarity(b);
  if (!normA || !normB) return false;

  const wordsA = toWordSet(normA);
  const wordsB = toWordSet(normB);
  const wordScore = jaccardSimilarity(wordsA, wordsB);
  const charScore = diceSimilarity(normA, normB);

  return wordScore >= 0.42 || charScore >= 0.6;
}

function areParagraphsStronglySimilar(a: string, b: string): boolean {
  const normA = normalizeForSimilarity(a);
  const normB = normalizeForSimilarity(b);
  if (!normA || !normB) return false;

  const wordsA = toWordSet(normA);
  const wordsB = toWordSet(normB);
  const wordScore = jaccardSimilarity(wordsA, wordsB);
  const charScore = diceSimilarity(normA, normB);

  return wordScore >= 0.56 || charScore >= 0.7;
}

function removeNearDuplicateParagraphs(paragraphs: string[]): string[] {
  const deduped: string[] = [];

  for (const paragraph of paragraphs) {
    const previous = deduped[deduped.length - 1];
    if (previous && areParagraphsSimilar(previous, paragraph)) {
      continue;
    }

    const hasRecentDuplicate = deduped
      .slice(Math.max(0, deduped.length - 20))
      .some(
        (existing) =>
          existing.length >= 80 &&
          paragraph.length >= 80 &&
          areParagraphsSimilar(existing, paragraph)
      );
    if (hasRecentDuplicate) continue;

    const hasGlobalStrongDuplicate = deduped.some(
      (existing) =>
        existing.length >= 120 &&
        paragraph.length >= 120 &&
        areParagraphsStronglySimilar(existing, paragraph)
    );
    if (hasGlobalStrongDuplicate) continue;

    deduped.push(paragraph);
  }

  return deduped;
}

function findSequenceReplayRestartIndex(paragraphs: string[]): number | null {
  if (paragraphs.length < 10) return null;

  const minWindow = 2;
  const minRun = 3;

  for (let i = 5; i <= paragraphs.length - minWindow; i += 1) {
    for (let j = 0; j <= i - minWindow - 2; j += 1) {
      const leadA = paragraphs.slice(j, j + minWindow).join(' ');
      const leadB = paragraphs.slice(i, i + minWindow).join(' ');
      if (leadA.length < 180 || leadB.length < 180) continue;

      let run = 0;
      while (
        i + run < paragraphs.length &&
        j + run < i &&
        areParagraphsSimilar(paragraphs[j + run], paragraphs[i + run])
      ) {
        run += 1;
      }

      if (run >= minRun) {
        return i;
      }
    }
  }

  return null;
}

function findLeadReplayIndex(paragraphs: string[]): number | null {
  if (paragraphs.length < 6) return null;

  const leadIndex = paragraphs.findIndex(
    (p) => !isDialogueOnly(p) && !isSceneBreak(p) && p.length >= 90
  );
  if (leadIndex === -1) return null;

  const lead = paragraphs[leadIndex];

  for (let i = leadIndex + 2; i < paragraphs.length; i += 1) {
    if (!areParagraphsStronglySimilar(lead, paragraphs[i])) continue;

    const supportA = paragraphs[leadIndex + 1];
    const supportB = paragraphs[i + 1];
    if (supportA && supportB && areParagraphsSimilar(supportA, supportB)) {
      return i;
    }

    if (i >= Math.floor(paragraphs.length * 0.42)) {
      return i;
    }
  }

  return null;
}

type SentenceUnit = {
  text: string;
  start: number;
};

function splitSentencesWithIndex(text: string): SentenceUnit[] {
  const units: SentenceUnit[] = [];
  const source = text.replace(/\r\n/g, '\n');
  const regex = /[^.!?…\n]+[.!?…]?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 10) continue;

    const leadingSpace = raw.search(/\S/);
    const startOffset = leadingSpace < 0 ? 0 : leadingSpace;
    units.push({
      text: trimmed,
      start: match.index + startOffset,
    });
  }

  return units;
}

function findSentenceReplayRestartIndex(text: string): number | null {
  const units = splitSentencesWithIndex(text);
  if (units.length < 10) return null;

  const minRun = 4;

  for (let j = 4; j <= units.length - minRun; j += 1) {
    for (let i = 0; i <= j - minRun; i += 1) {
      if (!areParagraphsStronglySimilar(units[i].text, units[j].text)) continue;
      if (!areParagraphsSimilar(units[i + 1].text, units[j + 1].text)) continue;

      let run = 0;
      let charRun = 0;

      while (
        j + run < units.length &&
        i + run < j &&
        areParagraphsSimilar(units[i + run].text, units[j + run].text)
      ) {
        charRun += units[j + run].text.length;
        run += 1;
      }

      if (run >= minRun && charRun >= 260) {
        return units[j].start;
      }
      if (run >= 3 && charRun >= 420) {
        return units[j].start;
      }
      // Beginning-led replay often mutates after 2-3 sentences; cut earlier.
      if (i <= 2 && run >= 2 && charRun >= 220) {
        return units[j].start;
      }
    }
  }

  return null;
}

function findLeadSentenceReplayIndex(text: string): number | null {
  const units = splitSentencesWithIndex(text);
  if (units.length < 8) return null;

  const lead = units[0];
  if (!lead || lead.text.length < 18) return null;

  for (let j = 4; j < units.length - 1; j += 1) {
    if (!areParagraphsStronglySimilar(lead.text, units[j].text)) continue;

    const supportMatch =
      (units[1] && units[j + 1] && areParagraphsSimilar(units[1].text, units[j + 1].text)) ||
      (units[2] && units[j + 2] && areParagraphsSimilar(units[2].text, units[j + 2].text));

    const replayTailChars = text.length - units[j].start;
    const appearsLateEnough = j >= Math.floor(units.length * 0.25);

    if ((supportMatch && replayTailChars >= 260) || (appearsLateEnough && replayTailChars >= 420)) {
      return units[j].start;
    }
  }

  return null;
}

function removeReplayRuns(paragraphs: string[]): string[] {
  if (paragraphs.length < 8) return paragraphs;

  const output: string[] = [];
  let i = 0;

  while (i < paragraphs.length) {
    const replay = findReplayRun(output, paragraphs, i);
    if (replay && replay.run >= 2) {
      i += replay.run;
      continue;
    }

    output.push(paragraphs[i]);
    i += 1;
  }

  return output;
}

function findReplayRun(
  output: string[],
  source: string[],
  sourceIndex: number
): { run: number } | null {
  if (output.length < 3 || sourceIndex >= source.length - 1) return null;

  const current = source[sourceIndex];
  const next = source[sourceIndex + 1];
  if (!current || !next) return null;
  if (current.length + next.length < 180) return null;

  let bestRun = 0;

  for (let j = 0; j < output.length - 1; j += 1) {
    if (!areParagraphsStronglySimilar(output[j], current)) continue;
    if (!areParagraphsSimilar(output[j + 1], next)) continue;

    let run = 0;
    while (
      sourceIndex + run < source.length &&
      j + run < output.length &&
      areParagraphsSimilar(output[j + run], source[sourceIndex + run])
    ) {
      run += 1;
      if (run >= 24) break;
    }

    if (run > bestRun) bestRun = run;
  }

  if (bestRun >= 3) return { run: bestRun };
  if (bestRun >= 2 && current.length + next.length >= 260) return { run: bestRun };
  return null;
}

export function trimReplayRestart(text: string): string {
  const normalizedText = text.replace(/\r\n/g, '\n').trim();
  if (!normalizedText) return normalizedText;

  const leadSentenceReplayStart = findLeadSentenceReplayIndex(normalizedText);
  if (leadSentenceReplayStart !== null) {
    return normalizedText.slice(0, leadSentenceReplayStart).trim();
  }

  const sentenceReplayStart = findSentenceReplayRestartIndex(normalizedText);
  if (sentenceReplayStart !== null) {
    return normalizedText.slice(0, sentenceReplayStart).trim();
  }

  const paragraphs = splitParagraphs(normalizedText);
  if (paragraphs.length < 8) return normalizedText;

  const anchorA = paragraphs[0];
  const anchorB = paragraphs[1] || '';

  for (let i = 3; i < paragraphs.length - 1; i += 1) {
    const firstMatches = areParagraphsSimilar(anchorA, paragraphs[i]);
    const secondMatches = anchorB ? areParagraphsSimilar(anchorB, paragraphs[i + 1]) : true;

    if (firstMatches && secondMatches) {
      return paragraphs.slice(0, i).join('\n\n').trim();
    }
  }

  const sequenceReplayIndex = findSequenceReplayRestartIndex(paragraphs);
  if (sequenceReplayIndex !== null) {
    return paragraphs.slice(0, sequenceReplayIndex).join('\n\n').trim();
  }

  const leadReplayIndex = findLeadReplayIndex(paragraphs);
  if (leadReplayIndex !== null) {
    return paragraphs.slice(0, leadReplayIndex).join('\n\n').trim();
  }

  return paragraphs.join('\n\n').trim();
}

export function normalizeSerialParagraphs(text: string): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return normalized;

  const rawParagraphs = splitParagraphs(normalized);
  const merged: string[] = [];

  for (const paragraph of rawParagraphs) {
    const previous = merged[merged.length - 1];
    if (shouldMerge(previous, paragraph)) {
      merged[merged.length - 1] = joinParagraphs(previous, paragraph);
      continue;
    }
    merged.push(paragraph);
  }

  const replayPruned = removeReplayRuns(merged);
  const deduped = removeNearDuplicateParagraphs(replayPruned);
  return deduped.join('\n\n').trim();
}

/**
 * 네이버웹소설 모바일 가독성 포맷 적용
 * - 대화문은 한 줄에 하나
 * - 서술문은 문장 단위로 줄바꿈 (1~2문장씩)
 * - 단락 사이 빈 줄로 구분
 */
export function formatForNaverMobile(text: string): string {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!normalized) return normalized;

  // 먼저 기존 단락 단위로 분리
  const paragraphs = normalized.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const outputLines: string[] = [];

  for (const paragraph of paragraphs) {
    // 장면 전환 마커는 그대로
    if (isSceneBreak(paragraph)) {
      outputLines.push('');
      outputLines.push(paragraph);
      outputLines.push('');
      continue;
    }

    // 단락 내 줄바꿈을 공백으로 통합
    const unified = paragraph.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    // 대화문과 서술문을 분리하여 처리
    const formatted = splitIntoMobileLines(unified);
    outputLines.push(...formatted);
    outputLines.push(''); // 단락 구분용 빈 줄
  }

  // 연속 빈 줄 정리 (최대 1개)
  const cleaned = outputLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

/**
 * 한 단락을 모바일 가독성 라인들로 분리
 */
function splitIntoMobileLines(paragraph: string): string[] {
  const lines: string[] = [];
  let remaining = paragraph.trim();

  while (remaining.length > 0) {
    // 대화문 시작 체크 (", ', ", ', 「, 『)
    const dialogueMatch = remaining.match(/^([""'「『][^""'」』]*[""'」』])/);
    if (dialogueMatch) {
      lines.push(dialogueMatch[1].trim());
      remaining = remaining.slice(dialogueMatch[1].length).trim();
      continue;
    }

    // 서술문: 문장 1~2개 단위로 자르기
    const sentenceEnd = findSentenceBreakPoint(remaining);
    if (sentenceEnd > 0 && sentenceEnd < remaining.length) {
      lines.push(remaining.slice(0, sentenceEnd).trim());
      remaining = remaining.slice(sentenceEnd).trim();
    } else {
      // 남은 전체를 추가
      if (remaining.trim()) {
        lines.push(remaining.trim());
      }
      break;
    }
  }

  return lines.filter(Boolean);
}

/**
 * 문장 끊김 지점 찾기 (1~2문장 단위, 40~100자 사이)
 */
function findSentenceBreakPoint(text: string): number {
  const minLen = 35;
  const targetLen = 70;
  const maxLen = 120;

  // 문장 종결 패턴: 마침표, 느낌표, 물음표, 말줄임표 뒤에 공백이나 따옴표
  const sentenceEndPattern = /[.!?…][)"'」』]?\s/g;

  let lastGoodBreak = -1;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndPattern.exec(text)) !== null) {
    const breakPos = match.index + match[0].length - 1; // 공백 직전까지

    if (breakPos >= minLen && breakPos <= maxLen) {
      lastGoodBreak = breakPos + 1; // 공백 포함

      // target 길이 근처면 여기서 자르기
      if (breakPos >= targetLen) {
        return lastGoodBreak;
      }
    } else if (breakPos > maxLen) {
      // 너무 길어지면 이전 좋은 지점에서 자르기
      if (lastGoodBreak > 0) {
        return lastGoodBreak;
      }
      // 좋은 지점이 없으면 현재 위치에서 자르기
      return breakPos + 1;
    }
  }

  // 문장 종결 패턴을 못 찾았거나 너무 짧으면
  if (lastGoodBreak > 0) {
    return lastGoodBreak;
  }

  // 쉼표 기준으로라도 자르기 (긴 문장의 경우)
  if (text.length > maxLen) {
    const commaPattern = /[,，]\s/g;
    while ((match = commaPattern.exec(text)) !== null) {
      const breakPos = match.index + match[0].length;
      if (breakPos >= targetLen && breakPos <= maxLen) {
        return breakPos;
      }
    }
  }

  return -1; // 자를 곳 없음
}
