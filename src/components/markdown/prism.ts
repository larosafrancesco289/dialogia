// Module: markdown/prism
// Responsibility: Syntax highlighting for fenced code: loads Prism and the grammar a
// block names on demand, and keeps the HTML it produced for finished blocks. Every
// string CodeBlock hands to innerHTML comes from here, so this is the file to audit.

// Escapes raw text to safe HTML when highlighting is not yet ready
export function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeLanguage(lang?: string): string | undefined {
  if (!lang) return undefined;
  const l = lang.toLowerCase();
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'sh' || l === 'shell') return 'bash';
  if (l === 'yml') return 'yaml';
  if (l === 'md') return 'markdown';
  if (l === 'html' || l === 'xml' || l === 'svg') return 'markup';
  return l;
}

const PRISM_CACHE = new Map<string, string>();
const PRISM_CACHE_MAX = 200;

export function highlightCacheKey(code: string, lang?: string) {
  return `${lang ?? 'markup'}::${code}`;
}

export function readCachedHighlight(key: string): string | undefined {
  return PRISM_CACHE.get(key);
}

export function cacheHighlight(key: string, html: string) {
  PRISM_CACHE.set(key, html);
  if (PRISM_CACHE.size > PRISM_CACHE_MAX) {
    const oldestKey = PRISM_CACHE.keys().next().value;
    if (oldestKey) PRISM_CACHE.delete(oldestKey);
  }
}

async function ensurePrismLanguage(lang?: string) {
  const PrismLib = (await import('prismjs')).default;
  if (typeof window !== 'undefined') {
    (window as Window & { Prism?: typeof PrismLib }).Prism = PrismLib;
  }
  const l = normalizeLanguage(lang);
  // Always have a baseline markup grammar for safety
  await import('prismjs/components/prism-markup');
  if (!l) return PrismLib;
  try {
    switch (l) {
      case 'javascript':
        await import('prismjs/components/prism-javascript');
        break;
      case 'jsx':
        await import('prismjs/components/prism-jsx');
        break;
      case 'typescript':
        await import('prismjs/components/prism-typescript');
        break;
      case 'tsx':
        await import('prismjs/components/prism-tsx');
        break;
      case 'json':
        await import('prismjs/components/prism-json');
        break;
      case 'markdown':
        await import('prismjs/components/prism-markdown');
        break;
      case 'bash':
        await import('prismjs/components/prism-bash');
        break;
      case 'python':
        await import('prismjs/components/prism-python');
        break;
      case 'go':
        await import('prismjs/components/prism-go');
        break;
      case 'rust':
        await import('prismjs/components/prism-rust');
        break;
      case 'java':
        await import('prismjs/components/prism-java');
        break;
      case 'sql':
        await import('prismjs/components/prism-sql');
        break;
      case 'yaml':
        await import('prismjs/components/prism-yaml');
        break;
      case 'toml':
        await import('prismjs/components/prism-toml');
        break;
      case 'diff':
        await import('prismjs/components/prism-diff');
        break;
      default:
        // Best-effort: no extra import
        break;
    }
  } catch {
    // ignore missing language modules
  }
  return PrismLib;
}

/** Prism's HTML for `code`, which it escapes; `lang` is already normalized. */
export async function highlightCode(code: string, lang?: string): Promise<string> {
  const Prism = await ensurePrismLanguage(lang);
  const grammar = (lang && Prism.languages[lang]) || Prism.languages.markup;
  return Prism.highlight(code, grammar, (lang as string) || 'markup');
}
