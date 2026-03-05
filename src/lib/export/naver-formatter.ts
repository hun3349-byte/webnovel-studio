/**
 * 네이버 시리즈 포맷터
 *
 * 네이버 시리즈 웹소설 업로드 형식에 맞게 텍스트를 변환합니다.
 *
 * 특징:
 * - HTML 형식 지원 (기본 태그만)
 * - 문단 구분: <p> 태그 또는 빈 줄
 * - 대사: 별도 스타일링 가능
 * - 최대 글자 수: 회차당 약 15,000자 권장
 */

export interface NaverExportOptions {
  // 출력 형식
  format: 'html' | 'text';
  // 문단 구분 방식
  paragraphStyle: 'p-tag' | 'br-tag' | 'newline';
  // 대사 강조
  highlightDialogue: boolean;
  // 장면 전환 표시
  sceneBreakStyle: 'asterisk' | 'line' | 'space';
  // 작가 노트 포함
  includeAuthorNote: boolean;
  authorNote?: string;
}

export interface NaverExportResult {
  title: string;
  episodeNumber: number;
  content: string;
  charCount: number;
  wordCount: number;
  warnings: string[];
}

const DEFAULT_OPTIONS: NaverExportOptions = {
  format: 'html',
  paragraphStyle: 'p-tag',
  highlightDialogue: false,
  sceneBreakStyle: 'asterisk',
  includeAuthorNote: false,
};

/**
 * 네이버 시리즈 형식으로 에피소드 변환
 */
export function formatForNaver(
  content: string,
  title: string,
  episodeNumber: number,
  options: Partial<NaverExportOptions> = {}
): NaverExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // 기본 정제
  let formatted = content.trim();

  // 마크다운 제거 (웹소설에서는 사용하지 않음)
  formatted = removeMarkdown(formatted);

  // 글자 수 체크
  const charCount = formatted.length;
  if (charCount > 15000) {
    warnings.push(`글자 수가 ${charCount}자로 권장 최대치(15,000자)를 초과했습니다.`);
  }
  if (charCount < 3000) {
    warnings.push(`글자 수가 ${charCount}자로 권장 최소치(3,000자) 미만입니다.`);
  }

  // 장면 전환 처리
  formatted = processSceneBreaks(formatted, opts.sceneBreakStyle);

  // 대사 강조 처리
  if (opts.highlightDialogue) {
    formatted = highlightDialogues(formatted);
  }

  // 형식별 처리
  if (opts.format === 'html') {
    formatted = convertToHtml(formatted, opts.paragraphStyle);
  } else {
    formatted = convertToPlainText(formatted);
  }

  // 작가 노트 추가
  if (opts.includeAuthorNote && opts.authorNote) {
    const noteHtml = opts.format === 'html'
      ? `<div class="author-note"><p><strong>작가의 말:</strong></p><p>${escapeHtml(opts.authorNote)}</p></div>`
      : `\n\n---\n작가의 말:\n${opts.authorNote}`;
    formatted += noteHtml;
  }

  // 단어 수 계산
  const wordCount = formatted.replace(/<[^>]*>/g, '').split(/\s+/).filter(Boolean).length;

  return {
    title,
    episodeNumber,
    content: formatted,
    charCount,
    wordCount,
    warnings,
  };
}

/**
 * 마크다운 문법 제거
 */
function removeMarkdown(text: string): string {
  return text
    // 헤더 제거
    .replace(/^#{1,6}\s+/gm, '')
    // 볼드/이탤릭 제거
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // 코드 블록 제거
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`(.+?)`/g, '$1')
    // 링크 제거
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    // 이미지 제거
    .replace(/!\[.*?\]\(.+?\)/g, '')
    // 구분선 처리 (나중에 장면 전환으로 변환)
    .replace(/^[-*_]{3,}$/gm, '---SCENE_BREAK---')
    // 인용구 제거
    .replace(/^>\s+/gm, '');
}

/**
 * 장면 전환 처리
 */
function processSceneBreaks(
  text: string,
  style: 'asterisk' | 'line' | 'space'
): string {
  const breakMarkers: Record<string, string> = {
    asterisk: '\n\n* * *\n\n',
    line: '\n\n────────────────\n\n',
    space: '\n\n\n\n',
  };

  return text.replace(/---SCENE_BREAK---/g, breakMarkers[style]);
}

/**
 * 대사 강조 처리 (따옴표로 둘러싸인 텍스트)
 */
function highlightDialogues(text: string): string {
  // 큰따옴표 대사
  return text.replace(/"([^"]+)"/g, '<span class="dialogue">"$1"</span>');
}

/**
 * HTML 형식으로 변환
 */
function convertToHtml(
  text: string,
  paragraphStyle: 'p-tag' | 'br-tag' | 'newline'
): string {
  // 문단 분리
  const paragraphs = text.split(/\n\n+/);

  if (paragraphStyle === 'p-tag') {
    return paragraphs
      .map(p => {
        const lines = p.split('\n').map(line => escapeHtml(line.trim())).filter(Boolean);
        return `<p>${lines.join('<br>')}</p>`;
      })
      .join('\n');
  } else if (paragraphStyle === 'br-tag') {
    return paragraphs
      .map(p => {
        const lines = p.split('\n').map(line => escapeHtml(line.trim())).filter(Boolean);
        return lines.join('<br>');
      })
      .join('<br><br>');
  } else {
    return escapeHtml(text);
  }
}

/**
 * 플레인 텍스트로 변환
 */
function convertToPlainText(text: string): string {
  // 이미 플레인 텍스트이므로 정리만
  return text
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 여러 에피소드를 네이버 형식으로 일괄 변환
 */
export function batchFormatForNaver(
  episodes: Array<{ content: string; title: string; episodeNumber: number }>,
  options: Partial<NaverExportOptions> = {}
): NaverExportResult[] {
  return episodes.map(ep =>
    formatForNaver(ep.content, ep.title, ep.episodeNumber, options)
  );
}

/**
 * 네이버 업로드용 미리보기 HTML 생성
 */
export function generateNaverPreviewHtml(result: NaverExportResult): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${result.episodeNumber}화 - ${result.title}</title>
  <style>
    body {
      font-family: 'Noto Sans KR', sans-serif;
      max-width: 680px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.8;
      color: #333;
      background: #fff;
    }
    h1 {
      font-size: 1.5em;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 1px solid #eee;
    }
    p {
      margin: 0 0 1em 0;
      text-indent: 1em;
    }
    .dialogue {
      color: #1a1a1a;
    }
    .author-note {
      margin-top: 40px;
      padding: 20px;
      background: #f9f9f9;
      border-radius: 8px;
      font-size: 0.9em;
    }
    .stats {
      margin-top: 30px;
      padding: 15px;
      background: #f5f5f5;
      border-radius: 4px;
      font-size: 0.85em;
      color: #666;
    }
  </style>
</head>
<body>
  <h1>${result.episodeNumber}화. ${result.title}</h1>
  <article>
    ${result.content}
  </article>
  <div class="stats">
    글자 수: ${result.charCount.toLocaleString()}자 |
    단어 수: ${result.wordCount.toLocaleString()}개
  </div>
</body>
</html>`;
}
