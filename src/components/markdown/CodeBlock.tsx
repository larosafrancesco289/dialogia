import { useEffect, useState } from 'react';
import {
  cacheHighlight,
  escapeHtml,
  highlightCacheKey,
  highlightCode,
  normalizeLanguage,
  readCachedHighlight,
} from '@/components/markdown/prism';

export function CodeBlock({
  code,
  language,
  streaming,
}: {
  code: string;
  language?: string;
  streaming?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const lang = normalizeLanguage(language);
  useEffect(() => {
    let cancelled = false;
    const cacheKey = highlightCacheKey(code, lang);
    const cached = readCachedHighlight(cacheKey);
    if (cached) {
      setHtml((prev) => (prev === cached ? prev : cached));
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const h = await highlightCode(code, lang);
        if (cancelled) return;
        setHtml((prev) => (prev === h ? prev : h));
        // Streaming snapshots are dead keys after the next flush; caching them
        // would just evict useful entries.
        if (!streaming) cacheHighlight(cacheKey, h);
      } catch {
        if (!cancelled) {
          setHtml((prev) => (prev === null ? prev : null));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang, streaming]);
  const cls = `language-${lang ?? 'markup'}`;
  // Only Prism's output or the escaped source: model output never reaches here raw.
  return <code className={cls} dangerouslySetInnerHTML={{ __html: html ?? escapeHtml(code) }} />;
}
