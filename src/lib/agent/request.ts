// Module: agent/request
// Responsibility: Compose request plugins for PDF parsing and OpenRouter's web plugin.

import type { PluginConfig } from '@/lib/agent/types';
import { isNativeSearchMode, type SearchMode } from '@/lib/search/providers/types';

export function pdfPlugins(hasPdf: boolean): PluginConfig[] | undefined {
  if (!hasPdf) return undefined;
  const pdfPlugin: PluginConfig = { id: 'file-parser', pdf: { engine: 'pdf-text' } };
  return [pdfPlugin];
}

export function composePlugins(opts: {
  hasPdf: boolean;
  searchEnabled?: boolean;
  searchProvider?: SearchMode;
}): PluginConfig[] | undefined {
  const arr: PluginConfig[] = [];
  const base = pdfPlugins(opts.hasPdf);
  if (base && base.length) arr.push(...base);
  // The `web` plugin is OpenRouter's native search; the Anthropic transport
  // reinterprets it as that API's own `web_search` server tool.
  if (opts.searchEnabled && isNativeSearchMode(opts.searchProvider)) arr.push({ id: 'web' });
  return arr.length > 0 ? arr : undefined;
}
