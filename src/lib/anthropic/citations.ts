// Module: anthropic/citations
// Responsibility: What a native web search found and the reply cited, as the
// `url_citation` annotations the app reads a reply's sources from (see
// `ui/messageSources`), the shape OpenRouter sends them in.

import { isRecord } from '@/lib/utils/guards';

/** A search result, or a text block's citation of one; undefined when it names no page. */
export function citationAnnotation(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.url !== 'string' || !value.url) return undefined;
  const title = typeof value.title === 'string' && value.title ? value.title : undefined;
  const citedText =
    typeof value.cited_text === 'string' && value.cited_text ? value.cited_text : undefined;
  return {
    type: 'url_citation',
    url_citation: {
      url: value.url,
      ...(title ? { title } : {}),
      ...(citedText ? { content: citedText } : {}),
    },
  };
}

/**
 * The annotations in one content block: a search's results, or the citations
 * on a text block. A search that failed carries an error object, not results.
 */
export function blockAnnotations(block: unknown): Array<Record<string, unknown>> {
  if (!isRecord(block)) return [];
  const cited =
    block.type === 'web_search_tool_result'
      ? block.content
      : block.type === 'text'
        ? block.citations
        : undefined;
  if (!Array.isArray(cited)) return [];
  return cited
    .map(citationAnnotation)
    .filter((entry): entry is Record<string, unknown> => entry !== undefined);
}
