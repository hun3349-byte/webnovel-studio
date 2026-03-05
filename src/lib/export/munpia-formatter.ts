/**
 * 문피아 포맷터
 *
 * 문피아 웹소설 업로드 형식에 맞게 텍스트를 변환합니다.
 *
 * 특징:
 * - 순수 텍스트 형식 (HTML 미지원)
 * - 문단 구분: 빈 줄
 * - 장면 전환: 빈 줄 또는 특수 기호
 * - 들여쓰기: 첫 줄 들여쓰기 가능
 * - 최대 글자 수: 회차당 약 12,000자 권장
 */

export interface MunpiaExportOptions {
  // 들여쓰기 사용
  useIndentation: boolean;
  // 들여쓰기 크기 (공백 수)
  indentSize: number;
  // 장면 전환 스타일
  sceneBreakStyle: 'asterisk' | 'dash' | 'space' | 'custom';
  // 커스텀 장면 전환 문자
  customSceneBreak?: string;
  // 대사 따옴표 스타일
  dialogueQuoteStyle: 'double' | 'single' | 'guillemet';
  // 작가 코멘트 포함
  includeAuthorComment: boolean;
  authorComment?: string;
  // 제목 포함
  includeTitle: boolean;
}

export interface MunpiaExportResult {
  title: string;
  episodeNumber: number;
  content: string;
  charCount: number;
  lineCount: number;
  paragraphCount: number;
  warnings: string[];
}

const DEFAULT_OPTIONS: MunpiaExportOptions = {
  useIndentation: true,
  indentSize: 2,
  sceneBreakStyle: 'asterisk',
  dialogueQuoteStyle: 'double',
  includeAuthorComment: false,
  includeTitle: false,
};

/**
 * 문피아 형식으로 에피소드 변환
 */
export function formatForMunpia(
  content: string,
  title: string,
  episodeNumber: number,
  options: Partial<MunpiaExportOptions> = {}
): MunpiaExportResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // 기본 정제
  let formatted = content.trim();

  // 마크다운 제거
  formatted = removeMarkdown(formatted);

  // HTML 태그 제거 (문피아는 순수 텍스트)
  formatted = stripHtml(formatted);

  // 글자 수 체크
  const charCount = formatted.length;
  if (charCount > 12000) {
    warnings.push(`글자 수가 ${charCount}자로 문피아 권장 최대치(12,000자)를 초과했습니다.`);
  }
  if (charCount < 2000) {
    warnings.push(`글자 수가 ${charCount}자로 권장 최소치(2,000자) 미만입니다.`);
  }

  // 장면 전환 처리
  formatted = processSceneBreaks(formatted, opts);

  // 대사 따옴표 스타일 변환
  formatted = convertDialogueQuotes(formatted, opts.dialogueQuoteStyle);

  // 문단 정리 및 들여쓰기
  formatted = formatParagraphs(formatted, opts);

  // 제목 추가
  if (opts.includeTitle) {
    formatted = `${episodeNumber}화. ${title}\n\n${formatted}`;
  }

  // 작가 코멘트 추가
  if (opts.includeAuthorComment && opts.authorComment) {
    formatted += `\n\n──────────────\n작가의 말\n──────────────\n${opts.authorComment}`;
  }

  // 통계 계산
  const lines = formatted.split('\n');
  const lineCount = lines.length;
  const paragraphCount = formatted.split(/\n\n+/).length;

  return {
    title,
    episodeNumber,
    content: formatted,
    charCount,
    lineCount,
    paragraphCount,
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
    // 구분선 처리
    .replace(/^[-*_]{3,}$/gm, '---SCENE_BREAK---')
    // 인용구 제거
    .replace(/^>\s+/gm, '');
}

/**
 * HTML 태그 제거
 */
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * 장면 전환 처리
 */
function processSceneBreaks(
  text: string,
  opts: MunpiaExportOptions
): string {
  let breakMarker: string;

  switch (opts.sceneBreakStyle) {
    case 'asterisk':
      breakMarker = '\n\n* * *\n\n';
      break;
    case 'dash':
      breakMarker = '\n\n────\n\n';
      break;
    case 'space':
      breakMarker = '\n\n\n\n';
      break;
    case 'custom':
      breakMarker = `\n\n${opts.customSceneBreak || '***'}\n\n`;
      break;
    default:
      breakMarker = '\n\n* * *\n\n';
  }

  return text.replace(/---SCENE_BREAK---/g, breakMarker);
}

/**
 * 대사 따옴표 스타일 변환
 */
function convertDialogueQuotes(
  text: string,
  style: 'double' | 'single' | 'guillemet'
): string {
  // 기존 따옴표 패턴 찾기
  const dialoguePattern = /[""]([^""]+)[""]/g;

  const quotes: Record<string, [string, string]> = {
    double: ['"', '"'],
    single: ["'", "'"],
    guillemet: ['«', '»'],
  };

  const [open, close] = quotes[style];
  return text.replace(dialoguePattern, `${open}$1${close}`);
}

/**
 * 문단 정리 및 들여쓰기
 */
function formatParagraphs(
  text: string,
  opts: MunpiaExportOptions
): string {
  const indent = opts.useIndentation ? ' '.repeat(opts.indentSize) : '';

  // 문단 분리
  const paragraphs = text.split(/\n\n+/);

  return paragraphs
    .map(para => {
      // 장면 전환 기호는 들여쓰기 안 함
      if (para.trim().match(/^[\*\-─]{1,4}$/)) {
        return para.trim();
      }

      // 각 줄 처리
      const lines = para.split('\n').map(line => line.trim()).filter(Boolean);

      if (lines.length === 0) return '';

      // 첫 줄 들여쓰기 (대사가 아닌 경우)
      return lines
        .map((line, idx) => {
          // 대사로 시작하면 들여쓰기 안 함
          if (line.match(/^["'«]/)) {
            return line;
          }
          // 첫 줄만 들여쓰기
          if (idx === 0 && opts.useIndentation) {
            return indent + line;
          }
          return line;
        })
        .join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 여러 에피소드를 문피아 형식으로 일괄 변환
 */
export function batchFormatForMunpia(
  episodes: Array<{ content: string; title: string; episodeNumber: number }>,
  options: Partial<MunpiaExportOptions> = {}
): MunpiaExportResult[] {
  return episodes.map(ep =>
    formatForMunpia(ep.content, ep.title, ep.episodeNumber, options)
  );
}

/**
 * 문피아 업로드용 텍스트 파일 생성
 */
export function generateMunpiaTextFile(result: MunpiaExportResult): string {
  const header = `제목: ${result.episodeNumber}화 - ${result.title}
글자 수: ${result.charCount.toLocaleString()}자
────────────────────────────────

`;

  return header + result.content;
}

/**
 * 전체 소설을 하나의 텍스트 파일로 합치기
 */
export function mergeEpisodesForMunpia(
  results: MunpiaExportResult[],
  novelTitle: string
): string {
  const header = `${novelTitle}
총 ${results.length}화
────────────────────────────────

`;

  const body = results
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
    .map(r => `【${r.episodeNumber}화】 ${r.title}\n\n${r.content}`)
    .join('\n\n════════════════════════════════\n\n');

  return header + body;
}
