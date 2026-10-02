// Module: markdown/citations
// Responsibility: Pure text transforms applied before markdown parsing, and the
// name a cited source goes by. Kept out of the renderer module so callers can
// use them without pulling react-markdown.

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
  // A price the model already escaped (`\$6.66`) stays as written: escaping
  // it again makes `\\$`, a literal backslash before a live dollar.
  return text.replace(
    /\$(\d[\d,]*(?:\.\d+)?[KMBkmb]?)(?![\w^_{}\\$=])/g,
    (match, amount: string, offset: number) =>
      isEscaped(text, offset) || opensInlineMath(text, offset) ? match : `\\$${amount}`,
  );
}

/** Whether the character at `index` follows an odd run of backslashes. */
function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  while (text[index - 1 - slashes] === '\\') slashes++;
  return slashes % 2 === 1;
}

export function hostname(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * A source's title, without the site name a page title often ends with
 * ("Nobel Prize in Physics - NobelPrize.org"): the host beside it says that.
 */
export function titleForSource(source: { title?: string; url?: string }) {
  const host = hostname(source.url);
  const title = source.title?.trim();
  if (!title) return host || source.url || 'Untitled source';
  const [, page, site] = title.match(/^(.+?)\s+[-|–—·]\s+([^-|–—·]+)$/) ?? [];
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const names = host
    .split('.')
    .slice(0, -1)
    .filter((label) => label.length >= 3);
  return page && names.some((name) => squash(site).includes(squash(name))) ? page : title;
}

/**
 * The URL without its `utm_*` tracking parameters (OpenAI's search adds
 * `utm_source=openai` to every source), or as it was when it has none.
 */
export function withoutTracking(url: string): string {
  try {
    const parsed = new URL(url);
    const tracking = [...parsed.searchParams.keys()].filter((key) => key.startsWith('utm_'));
    if (!tracking.length) return url;
    tracking.forEach((key) => parsed.searchParams.delete(key));
    return parsed.toString();
  } catch {
    return url;
  }
}

function markdownUrl(url: string) {
  return `<${url.replace(/>/g, '%3E')}>`;
}

/** A link title in markdown's quoted form: one line, its quotes and backslashes escaped. */
function markdownTitle(text: string) {
  return `"${text.replace(/\s+/g, ' ').trim().replace(/[\\"]/g, '\\$&')}"`;
}

// One [n] marker, or several side by side ("[2][4]", "[2] [4]"), not a link's text.
// A grouped "[1, 2]" is left alone: in maths it is as likely an interval.
const CITATION_RUN = /\[\d+\](?:[ \t]*\[\d+\])*(?!\()/g;

/**
 * Turns [n] markers into links to the nth source, titled with what the source
 * is ("Source 2: Page B"), which the renderer also gives as the link's name.
 * Markers side by side are joined by a comma: as links they show only their
 * numbers, and "[2][4]" would read as 24.
 */
export function linkCitationMarkers(content: string, sources?: MarkdownCitationSource[]) {
  if (!sources?.length) return content;
  return content.replace(CITATION_RUN, (run) => {
    const markers = run.match(/\d+/g) ?? [];
    const linked = markers.map((rawIndex) => {
      const source = sources[Number(rawIndex) - 1];
      if (!source?.url) return undefined;
      const title = markdownTitle(`Source ${rawIndex}: ${titleForSource(source)}`);
      return `[${rawIndex}](${markdownUrl(source.url)} ${title})`;
    });
    if (linked.every((link) => link === undefined)) return run;
    return linked.map((link, i) => link ?? `[${markers[i]}]`).join(', ');
  });
}

// "([python.org](https://…))": a parenthesis holding only links, the way
// provider-native search cites. Several may share it, split by commas.
const LINK = String.raw`\[[^[\]\n]+\]\(<?([^()\s<>]+)>?\)`;
const LINK_RE = new RegExp(LINK, 'g');
const LINK_GROUP_RE = new RegExp(String.raw`\(\s*${LINK}(?:\s*[,;]?\s*${LINK})*\s*\)`, 'g');

/** One spelling per page: no tracking, and "https://a.test" is "https://a.test/". */
function urlKey(url: string): string {
  try {
    return new URL(withoutTracking(url)).href;
  } catch {
    return url;
  }
}

/**
 * Turns a provider's own citations, links in parentheses to the pages its
 * search returned, into [n] markers for those sources, so they read like any
 * other citation. A group with a link to anything else is left as written.
 */
export function citeSourceLinks(content: string, sources?: MarkdownCitationSource[]) {
  if (!sources?.length) return content;
  const indexOf = (url: string) =>
    sources.findIndex((source) => source.url && urlKey(source.url) === urlKey(url));
  return content.replace(LINK_GROUP_RE, (group: string) => {
    const indices = [...group.matchAll(LINK_RE)].map((link) => indexOf(link[1]));
    if (indices.some((index) => index < 0)) return group;
    return indices.map((index) => `[${index + 1}]`).join('');
  });
}
