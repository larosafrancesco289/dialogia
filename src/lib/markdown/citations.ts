// Module: markdown/citations
// Responsibility: Pure text transforms applied before markdown parsing. Kept out
// of the renderer module so callers can use them without pulling react-markdown.

export type MarkdownCitationSource = {
  title?: string;
  url?: string;
  description?: string;
};

/**
 * Escape dollar signs that look like currency (e.g. $5, $100, $1.5M)
 * so they don't get interpreted as LaTeX math delimiters.
 * Preserves actual math like $x^2$, $\frac{a}{b}$, $2^n$ or $2$: a number
 * followed by a math operator or a closing `$` is not a price.
 */
export function escapeCurrency(text: string): string {
  // Match $ followed by digit, optional decimals/commas, optional K/M/B suffix
  // This catches: $5, $100, $1,000, $99.99, $5M, $1.5B, etc.
  // A function, not a '\\$$1' pattern: in a replacement string `$$` is a
  // literal dollar, which turned every price into "$1".
  return text.replace(
    /\$(\d[\d,]*(?:\.\d+)?[KMBkmb]?)(?![\w^_{}\\$=])/g,
    (_match, amount: string) => `\\$${amount}`,
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
