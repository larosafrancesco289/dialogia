// Module: markdown/citations
// Responsibility: Pure text transforms applied before markdown parsing. Kept out
// of the renderer module so callers can use them without pulling react-markdown.

export type MarkdownCitationSource = {
  title?: string;
  url?: string;
  description?: string;
};

// Something only math has between the dollars: a command, a script, a
// relation or an operator (a spaced minus, so "5-10" stays a range).
const MATH_SIGNAL_RE = /[\\^_={}+*/<>×÷]|\s[-−]\s/;

/**
 * Whether the `$` at `start`, before a number, opens inline math: the same
 * line closes it the way TeX does (no space before the closing `$`, no digit
 * right after it, so a second price never closes a first) around something
 * that reads as math. `$391 = 17 \times 23$` is math; `$5 and $10` is not.
 */
function opensInlineMath(text: string, start: number): boolean {
  const lineEnd = text.indexOf('\n', start);
  const rest = text.slice(start + 1, lineEnd === -1 ? undefined : lineEnd);
  const close = rest.search(/(?<!\\)\$/);
  if (close <= 0) return false;
  if (/\s/.test(rest[close - 1]) || /\d/.test(rest[close + 1] ?? '')) return false;
  return MATH_SIGNAL_RE.test(rest.slice(0, close));
}

/**
 * Escape dollar signs that look like currency (e.g. $5, $100, $1.5M)
 * so they don't get interpreted as LaTeX math delimiters.
 * Preserves actual math like $x^2$, $\frac{a}{b}$, $2^n$, $2$ or
 * $391 = 17 \times 23$: a number followed by a math operator or a closing
 * `$`, or opening a span TeX would close, is not a price.
 */
export function escapeCurrency(text: string): string {
  // Match $ followed by digit, optional decimals/commas, optional K/M/B suffix
  // This catches: $5, $100, $1,000, $99.99, $5M, $1.5B, etc.
  // A function, not a '\\$$1' pattern: in a replacement string `$$` is a
  // literal dollar, which turned every price into "$1".
  return text.replace(
    /\$(\d[\d,]*(?:\.\d+)?[KMBkmb]?)(?![\w^_{}\\$=])/g,
    (match, amount: string, offset: number) =>
      opensInlineMath(text, offset) ? match : `\\$${amount}`,
  );
}

function markdownUrl(url: string) {
  return `<${url.replace(/>/g, '%3E')}>`;
}

export function linkCitationMarkers(content: string, sources?: MarkdownCitationSource[]) {
  if (!sources?.length) return content;
  return content.replace(/\[(\d+)\](?!\()/g, (match, rawIndex: string) => {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 1) return match;
    const source = sources[index - 1];
    if (!source?.url) return match;
    return `[${rawIndex}](${markdownUrl(source.url)})`;
  });
}
