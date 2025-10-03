// Module: agent/request
// Responsibility: Centralize request-building utilities for OpenRouter flows.
// - Map UI route preference to provider sort
// - Compose plugins for PDF parsing and OpenRouter web plugin
// - Build a debug request body used in debug panels

import { isImageOutputSupported, isReasoningSupported } from '@/lib/models';

export type ProviderSort = 'price' | 'throughput' | undefined;

export function providerSortFromRoutePref(pref?: 'speed' | 'cost' | null): ProviderSort {
  if (pref === 'cost') return 'price';
  if (pref === 'speed') return 'throughput';
  return undefined;
}

export function pdfPlugins(hasPdf: boolean): Array<any> | undefined {
  if (!hasPdf) return undefined;
  return [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
}

export function composePlugins(opts: {
  hasPdf: boolean;
  searchEnabled?: boolean;
  searchProvider?: 'brave' | 'openrouter';
}): Array<any> | undefined {
  const arr: any[] = [];
  const base = pdfPlugins(opts.hasPdf);
  if (base && base.length) arr.push(...base);
  if (opts.searchEnabled && opts.searchProvider === 'openrouter') arr.push({ id: 'web' });
  return arr.length > 0 ? arr : undefined;
}

export function buildDebugBody(args: {
  modelId: string;
  messages: any[];
  stream: boolean;
  includeUsage?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoningEffort?: string | undefined;
  reasoningTokens?: number | undefined;
  tools?: any[] | undefined;
  toolChoice?: 'auto' | 'none' | undefined;
  providerSort?: ProviderSort;
  plugins?: any[] | undefined;
  canImageOut?: boolean;
}) {
  const body: any = {
    model: args.modelId,
    messages: args.messages,
    stream: args.stream,
  };
  if (args.includeUsage) body.stream_options = { include_usage: true };
  if (args.canImageOut) body.modalities = ['image', 'text'];
  if (typeof args.temperature === 'number') body.temperature = args.temperature;
  if (typeof args.top_p === 'number') body.top_p = args.top_p;
  if (typeof args.max_tokens === 'number') body.max_tokens = args.max_tokens;
  if (args.reasoningEffort || typeof args.reasoningTokens === 'number') {
    const rc: any = {};
    if (args.reasoningEffort) rc.effort = args.reasoningEffort;
    if (typeof args.reasoningTokens === 'number') rc.max_tokens = args.reasoningTokens;
    if (Object.keys(rc).length) body.reasoning = rc;
  }
  if (args.tools && args.tools.length) body.tools = args.tools;
  if (args.toolChoice) body.tool_choice = args.toolChoice;
  if (args.providerSort === 'price' || args.providerSort === 'throughput') {
    body.provider = { sort: args.providerSort };
  }
  if (args.plugins && args.plugins.length) body.plugins = args.plugins;
  return body;
}
