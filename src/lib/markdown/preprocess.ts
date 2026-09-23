// Module: markdown/preprocess
// Responsibility: The text pass that runs before markdown parsing. Every
// transform here is about prose, so fenced blocks and inline code spans pass
// through untouched: a shell `$1` or an `arr[1]` is code, not currency or a
// citation.

import {
  escapeCurrency,
  linkCitationMarkers,
  type MarkdownCitationSource,
} from '@/lib/markdown/citations';

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})\s*$/;

function mapOutsideInlineCode(text: string, transform: (prose: string) => string): string {
  let result = '';
  let last = 0;
  const runs = /`+/g;
  let open: RegExpExecArray | null;
  while ((open = runs.exec(text))) {
    // A code span closes on the next run of exactly the same length; an
    // unmatched run is literal backticks.
    const close = new RegExp(`(?<!\`)${open[0]}(?!\`)`, 'g');
    close.lastIndex = open.index + open[0].length;
    const match = close.exec(text);
    if (!match) continue;
    const end = match.index + open[0].length;
    result += transform(text.slice(last, open.index)) + text.slice(open.index, end);
    last = end;
    runs.lastIndex = end;
  }
  return result + transform(text.slice(last));
}

/** Apply `transform` to prose only, leaving fenced code and code spans exact. */
export function mapOutsideCode(text: string, transform: (prose: string) => string): string {
  let result = '';
  let prose = '';
  let fence = '';
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    const piece = index < lines.length - 1 ? `${line}\n` : line;
    if (fence) {
      result += piece;
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = '';
      return;
    }
    const open = line.match(FENCE_OPEN_RE);
    if (open) {
      result += mapOutsideInlineCode(prose, transform) + piece;
      prose = '';
      fence = open[1];
      return;
    }
    prose += piece;
  });
  return result + mapOutsideInlineCode(prose, transform);
}

// `\\[` is a LaTeX line break with spacing (`\\[4pt]`), not a delimiter.
const DISPLAY_MATH_RE = /(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g;
const INLINE_MATH_RE = /(?<!\\)\\\(([^\n]+?)(?<!\\)\\\)/g;

/**
 * remark-math reads only `$…$` and `$$…$$`, but many models write LaTeX's own
 * `\(…\)` and `\[…\]`, which markdown then eats as escaped brackets. Display
 * math standing on its own line becomes a `$$` block at the same indent, so it
 * stays inside a list item; mid-sentence display math stays inline.
 */
export function normalizeMathDelimiters(text: string): string {
  const display = text.replace(DISPLAY_MATH_RE, (match, inner: string, offset: number) => {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const before = text.slice(lineStart, offset);
    const end = offset + match.length;
    const lineEnd = text.indexOf('\n', end);
    const after = text.slice(end, lineEnd === -1 ? undefined : lineEnd);
    const body = inner.trim();
    if (!before.trim() && !after.trim()) return `$$\n${before}${body}\n${before}$$`;
    return `$$${body}$$`;
  });
  return display.replace(INLINE_MATH_RE, (_match, inner: string) => `$${inner.trim()}$`);
}

export function preprocessMarkdown(content: string, sources?: MarkdownCitationSource[]): string {
  return mapOutsideCode(content, (prose) =>
    linkCitationMarkers(normalizeMathDelimiters(escapeCurrency(prose)), sources),
  );
}
