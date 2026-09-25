// Module: ui/messageSources
// Responsibility: The sources a reply consulted, whichever search found them:
// a tool-based search's results, or the citations a provider-native search
// left on the message as annotations. The ledger's sources and the reply's
// [n] citation links both read this one list.

import type { MarkdownCitationSource } from '@/lib/markdown/citations';
import type { SearchSourcesData } from '@/lib/ui/responseActivity';
import { isRecord } from '@/lib/utils/guards';

// Where a source can sit inside an annotation: OpenAI's (and OpenRouter's)
// `{ type: 'url_citation', url_citation: {...} }`, or a nested list.
const NESTED_KEYS = ['url_citation', 'annotations', 'citations', 'sources'] as const;

function collect(value: unknown, out: MarkdownCitationSource[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (!isRecord(value)) return;
  const url = typeof value.url === 'string' ? value.url.trim() : '';
  if (url) {
    const title = typeof value.title === 'string' && value.title.trim() ? value.title : undefined;
    const description =
      typeof value.content === 'string' && value.content.trim()
        ? value.content
        : typeof value.description === 'string' && value.description.trim()
          ? value.description
          : undefined;
    out.push({ url, title, description });
  }
  for (const key of NESTED_KEYS) collect(value[key], out);
}

/**
 * The sources in a message's annotations, in the order they are first cited,
 * once per URL. A later citation of the same page fills in a title or excerpt
 * the first one lacked. Annotations that are not about a web page (a parsed
 * PDF, say) contribute nothing.
 */
export function sourcesFromAnnotations(annotations: unknown): MarkdownCitationSource[] {
  const found: MarkdownCitationSource[] = [];
  collect(annotations, found);
  const byUrl = new Map<string, MarkdownCitationSource>();
  for (const source of found) {
    const url = source.url as string;
    const seen = byUrl.get(url);
    if (!seen) {
      byUrl.set(url, { ...source });
      continue;
    }
    seen.title ??= source.title;
    seen.description ??= source.description;
  }
  return [...byUrl.values()].map((source) => ({
    url: source.url,
    ...(source.title ? { title: source.title } : {}),
    ...(source.description ? { description: source.description } : {}),
  }));
}

/**
 * What the reply's sources are: a tool-based search's own entry when there is
 * one (it also carries the search's progress and errors), otherwise the
 * citations a provider-native search returned, as a finished search.
 */
export function resolveMessageSources({
  searchEntry,
  annotations,
}: {
  searchEntry?: SearchSourcesData;
  annotations?: unknown;
}): SearchSourcesData | undefined {
  if (searchEntry) return searchEntry;
  const results = sourcesFromAnnotations(annotations);
  if (results.length === 0) return undefined;
  return { query: '', status: 'done', results };
}
