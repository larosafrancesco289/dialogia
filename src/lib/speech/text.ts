// Module: speech/text
// Responsibility: A reply as it is read aloud. Markdown's syntax goes; every
// heading, list item and table row becomes a sentence the voice pauses after;
// code and diagrams are named rather than read; a formula is said in words.

import { escapeCurrency, hostname } from '@/lib/markdown/citations';
import { normalizeMathDelimiters } from '@/lib/markdown/preprocess';
import { texToWords, type GreekLetters, type MathWords } from '@/lib/speech/tex';

export type SpeechLabels = {
  codeSkipped: string;
  diagramSkipped: string;
  math: MathWords;
  greekLetters?: GreekLetters;
};

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)/;
const HEADING_RE = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const QUOTE_RE = /^ {0,3}(?:>[ \t]?)+/;
const ITEM_RE = /^\s*(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;
const RULE_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const TABLE_DIVIDER_RE = /^ {0,3}\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/;
const REFERENCE_RE = /^ {0,3}\[[^\]]+\]:\s*\S+/;

// Blocks a model writes for the app, not the reader: reasoning and tool calls
// some servers leave in the text.
const MACHINE_BLOCK_RE =
  /<(think|thinking|tool_call|tool_use|tool_result|function_calls|function_results|invoke)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi;
const TAG_RE = /<\/?[a-zA-Z][\w:-]*(?:\s[^<>]*)?\/?>/g;

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const LINK_ONLY_GROUP_RE =
  /\s?\(\s*\[[^[\]\n]+\]\([^()\s]+\)(?:\s*[,;]?\s*\[[^[\]\n]+\]\([^()\s]+\))*\s*\)/g;
const CITATION_RE = /\s?\[(?:\d+|\^[^\]\s]+)\](?:\s?\[(?:\d+|\^[^\]\s]+)\])*(?![(:])/g;

// CommonMark lets a backslash escape any ASCII punctuation.
const ESCAPE_RE = /\\([!-/:-@[-`{-~])/g;
// Held characters (escapes, code spans) sit in the private-use area, where no
// pattern below can read them as syntax.
const ESCAPE_BASE = 0xe000;
const ESCAPE_HELD_RE = /[-]/g;
const CODE_BASE = 0xe100;
const CODE_HELD_RE = /[-]/g;

const SENTENCE_END_RE = /[.!?…:;。！？]["'”’»)\]]*$/u;

/** End a block with a full stop unless it already ends a sentence, so the voice pauses. */
function asSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return SENTENCE_END_RE.test(trimmed) ? trimmed : `${trimmed}.`;
}

function urlWords(raw: string): string {
  const trailing = /[.,;:!?)\]]+$/.exec(raw)?.[0] ?? '';
  const url = raw.slice(0, raw.length - trailing.length);
  const host = hostname(/^www\./i.test(url) ? `https://${url}` : url);
  return host + trailing;
}

function emphasisless(text: string): string {
  return text
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '$1')
    .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, '$1')
    .replace(/(^|[^\w])_(?=\S)([^_]+?)(?<=\S)_(?!\w)/g, '$1$2');
}

class Reader {
  private code: string[] = [];

  constructor(private labels: SpeechLabels) {}

  private math(tex: string): string {
    return texToWords(tex, this.labels.math, this.labels.greekLetters);
  }

  /** Code spans held aside, so nothing below reads their text as syntax. */
  holdCode(text: string): string {
    return text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_match, _ticks, body: string) => {
      this.code.push(body.trim());
      return String.fromCharCode(CODE_BASE + this.code.length - 1);
    });
  }

  releaseCode(text: string): string {
    return text.replace(CODE_HELD_RE, (char) => this.code[char.charCodeAt(0) - CODE_BASE] ?? '');
  }

  /** Display maths as a sentence of its own, inline maths as words in place. */
  mathAsWords(prose: string): string {
    const delimited = normalizeMathDelimiters(escapeCurrency(prose));
    return delimited
      .replace(/(?<!\\)\$\$([\s\S]+?)(?<!\\)\$\$/g, (_m, tex: string) => {
        const words = this.math(tex);
        return words ? `\n\n${asSentence(words)}\n\n` : '';
      })
      .replace(/(?<![\\$])\$(?!\$)([^\n$]+?)(?<!\\)\$/g, (_m, tex: string) => this.math(tex));
  }

  /** One line of prose without its inline syntax. */
  inline(line: string): string {
    const held = line.replace(ESCAPE_RE, (_m, char: string) =>
      String.fromCharCode(ESCAPE_BASE + char.charCodeAt(0)),
    );
    const plain = emphasisless(
      held
        .replace(LINK_ONLY_GROUP_RE, '')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(CITATION_RE, '')
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
        .replace(/<((?:https?|mailto):[^>\s]+)>/gi, '$1')
        .replace(TAG_RE, ' ')
        .replace(URL_RE, urlWords),
    );
    return plain
      .replace(ESCAPE_HELD_RE, (char) => String.fromCharCode(char.charCodeAt(0) - ESCAPE_BASE))
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private cell(text: string): string {
    return this.inline(this.mathAsWords(this.holdCode(text)).replace(/\s+/g, ' '));
  }

  /** "Header: value, Header: value." for each body row. */
  table(header: string[], rows: string[][]): string[] {
    const cells = (row: string[]) =>
      row
        .map((cell, index) => {
          const value = this.cell(cell);
          const name = this.cell(header[index] ?? '');
          if (!value) return '';
          return name ? `${name}: ${value}` : value;
        })
        .filter(Boolean)
        .join(', ');
    return rows.map((row) => asSentence(cells(row))).filter(Boolean);
  }

  /** Paragraphs, headings and list items of a stretch of prose, each a sentence. */
  prose(text: string): string[] {
    const blocks: string[] = [];
    let paragraph: string[] = [];
    const flush = () => {
      const sentence = asSentence(paragraph.join(' '));
      if (sentence) blocks.push(sentence);
      paragraph = [];
    };
    for (const raw of this.mathAsWords(text).split('\n')) {
      if (RULE_RE.test(raw) || REFERENCE_RE.test(raw)) {
        flush();
        continue;
      }
      const line = raw.replace(QUOTE_RE, '');
      if (!line.trim()) {
        flush();
        continue;
      }
      const heading = HEADING_RE.exec(line);
      const item = ITEM_RE.exec(line);
      if (heading || item) {
        flush();
        const words = this.inline(heading ? heading[1] : line.slice(item![0].length));
        if (words) blocks.push(asSentence(words));
        continue;
      }
      const words = this.inline(line);
      if (words) paragraph.push(words);
    }
    flush();
    return blocks;
  }
}

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());

/**
 * A reply in words to be read aloud, one sentence or block per line. Code is
 * named, not read (`labels.codeSkipped`, `labels.diagramSkipped` for Mermaid);
 * inline code is read as its text; a link is its words, a bare address its
 * site's name; a table is read row by row; a formula is said in words.
 */
export function toSpeakableText(markdown: string, labels: SpeechLabels): string {
  const reader = new Reader(labels);
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let prose: string[] = [];
  const flushProse = () => {
    if (!prose.length) return;
    const text = reader.holdCode(prose.join('\n')).replace(MACHINE_BLOCK_RE, ' ');
    blocks.push(...reader.prose(text));
    prose = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushProse();
      const [, marker, info] = fence;
      const body: string[] = [];
      for (i++; i < lines.length; i++) {
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(lines[i]);
        if (close && close[1][0] === marker[0] && close[1].length >= marker.length) break;
        body.push(lines[i]);
      }
      const language = info.toLowerCase();
      if (language === 'math' || language === 'latex' || language === 'tex') {
        const words = texToWords(body.join(' '), labels.math, labels.greekLetters);
        if (words) blocks.push(asSentence(words));
      } else {
        blocks.push(language === 'mermaid' ? labels.diagramSkipped : labels.codeSkipped);
      }
      continue;
    }
    if (line.includes('|') && TABLE_DIVIDER_RE.test(lines[i + 1] ?? '')) {
      flushProse();
      const header = splitRow(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) {
        rows.push(splitRow(lines[i]));
      }
      i--;
      blocks.push(...reader.table(header, rows));
      continue;
    }
    prose.push(line);
  }
  flushProse();

  return blocks
    .map((block) => reader.releaseCode(block).replace(/\s+/g, ' ').trim())
    .filter((block) => block && /[\p{L}\p{N}]/u.test(block))
    .join('\n');
}
