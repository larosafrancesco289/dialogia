export type HtmlContentSummary = {
  title?: string;
  description?: string;
  headings?: string[];
  text: string;
};

const ENTITY_REGEX = /&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/g;
const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
};

function decodeEntities(value: string): string {
  return value.replace(ENTITY_REGEX, (entity) => ENTITY_MAP[entity] ?? ' ');
}

export function extractMainText(html: string): HtmlContentSummary {
  const pick = (re: RegExp) => {
    const match = html.match(re);
    return match ? decodeEntities(match[1].trim()) : undefined;
  };

  const strip = (fragment: string) =>
    decodeEntities(
      fragment
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );

  const pickRegion = (pattern: RegExp) => {
    const match = html.match(pattern);
    return match ? match[0] : undefined;
  };

  const article = pickRegion(/<article[\s\S]*?<\/article>/i);
  const main = pickRegion(/<main[\s\S]*?<\/main>/i);
  const body = pickRegion(/<body[\s\S]*?<\/body>/i);
  const source = article || main || body || html;
  const text = strip(source).slice(0, 12000);

  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i) ||
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const headings: string[] = [];
  const seen = new Set<string>();
  const headingSources = [main, article, body, html].filter(Boolean) as string[];
  for (const chunk of headingSources) {
    const headingRegex = /<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(chunk))) {
      const [, , headingContent] = match;
      const cleaned = strip(headingContent);
      if (!cleaned || seen.has(cleaned)) continue;
      seen.add(cleaned);
      headings.push(cleaned);
      if (headings.length >= 12) break;
    }
    if (headings.length >= 12) break;
  }

  return { title, description, headings: headings.length ? headings : undefined, text };
}

/**
 * Inline script used before hydration to ensure the correct theme class is
 * present on the root element. The logic mirrors the previous inline script in
 * app/layout but lives here for reuse and testability.
 */
export function injectThemeClass(): string {
  return `(() => {
  try {
    const mode = localStorage.getItem('theme') || 'auto';
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = mode === 'dark' || (mode === 'auto' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldUseDark);
  } catch (_) {
    // no-op: theme will fall back to default styles
  }
})();`;
}
