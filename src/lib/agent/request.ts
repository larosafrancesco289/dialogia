// Module: agent/request
// Responsibility: Compose request plugins for PDF parsing and OpenRouter's web plugin.

import type { ModelMessage, PluginConfig } from '@/lib/agent/types';
import { isNativeSearchMode, type SearchMode } from '@/lib/search/providers/types';

/**
 * OpenRouter's PDF parser, for a request that sends a PDF as a file part. A
 * PDF read in the browser goes as text, and needs no parser.
 */
export function pdfPlugins(messages: ModelMessage[]): PluginConfig[] | undefined {
  const sendsFile = messages.some(
    (message) =>
      Array.isArray(message.content) && message.content.some((part) => part.type === 'file'),
  );
  return sendsFile ? [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] : undefined;
}

export function composePlugins(opts: {
  messages: ModelMessage[];
  searchEnabled?: boolean;
  searchProvider?: SearchMode;
}): PluginConfig[] | undefined {
  const arr: PluginConfig[] = [];
  const base = pdfPlugins(opts.messages);
  if (base && base.length) arr.push(...base);
  // The `web` plugin is OpenRouter's native search; the Anthropic transport
  // reinterprets it as that API's own `web_search` server tool.
  if (opts.searchEnabled && isNativeSearchMode(opts.searchProvider)) arr.push({ id: 'web' });
  return arr.length > 0 ? arr : undefined;
}
