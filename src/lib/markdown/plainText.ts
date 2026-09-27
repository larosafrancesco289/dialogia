// Module: markdown/plainText
// Responsibility: Markdown read as prose, with its syntax taken out: what shows
// while the renderer loads, so a reply never flashes asterisks and hashes.
// Code keeps its text; only the fences and backticks go.

import { mapOutsideCode } from '@/lib/markdown/preprocess';

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const QUOTE_RE = /^ {0,3}(?:>[ \t]?)+/;
const BULLET_RE = /^(\s*)[-*+][ \t]+/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TABLE_DIVIDER_RE = /^ {0,3}\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;

// CommonMark lets a backslash escape any ASCII punctuation: `\$5`, `\*`, `\#`.
const ESCAPE_RE = /\\([!-/:-@[-`{-~])/g;
// Each held character sits in the private-use plane at its own code point,
// where no syntax pattern below can read it as a marker.
const HELD_OFFSET = 0xe000;
const HELD_RE = /[\ue021-\ue07e]/g;

/** Hide backslash-escaped punctuation from the syntax patterns that follow. */
export function holdEscapes(text: string): string {
  return text.replace(ESCAPE_RE, (_match, char: string) =>
    String.fromCharCode(HELD_OFFSET + char.charCodeAt(0)),
  );
}

/** Put the characters `holdEscapes` hid back, without their backslashes. */
export function releaseEscapes(text: string): string {
  return text.replace(HELD_RE, (char) => String.fromCharCode(char.charCodeAt(0) - HELD_OFFSET));
}

function stripInline(line: string): string {
  return (
    line
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1')
      .replace(/`+([^`]+?)`+/g, '$1')
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
      .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
      .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, '$1')
      // Underscores inside a word (snake_case) are not emphasis.
      .replace(/(^|[^\w])_(?=\S)([^_]+?)(?<=\S)_(?!\w)/g, '$1$2')
  );
}

function tableRow(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || trimmed.length < 2) return null;
  return trimmed
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())
    .join('   ');
}

export function markdownToPlainText(markdown: string): string {
  const out: string[] = [];
  let fence: string | null = null;

  // Escapes mean nothing inside code, so only prose has them held.
  for (const line of mapOutsideCode(markdown, holdEscapes).split('\n')) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) {
        fence = null;
      } else {
        out.push(line);
      }
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      continue;
    }
    if (RULE_RE.test(line) || TABLE_DIVIDER_RE.test(line)) {
      out.push('');
      continue;
    }
    let text = line.replace(QUOTE_RE, '');
    const heading = HEADING_RE.exec(text);
    if (heading) text = heading[1];
    text = text.replace(BULLET_RE, '$1• ');
    text = tableRow(text) ?? text;
    out.push(stripInline(text));
  }

  return releaseEscapes(out.join('\n').replace(/\n{3,}/g, '\n\n'));
}

/** A one-line opening of the text, for a heading that names a message. */
export function plainExcerpt(markdown: string, maxChars = 80): string {
  const text = markdownToPlainText(markdown).replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
