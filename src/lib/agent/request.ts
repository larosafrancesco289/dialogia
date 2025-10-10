// Module: agent/request
// Responsibility: Centralize request-building utilities for OpenRouter flows.
// - Map UI route preference to provider sort
// - Compose plugins for PDF parsing and OpenRouter web plugin
// - Build a debug request body used in debug panels

import type { StoreState } from '@/lib/store/types';
import { isImageOutputSupported, isReasoningSupported } from '@/lib/models';
import type {
  PluginConfig,
  ToolDefinition,
  StoreAccess,
  StoreSetter,
  StoreGetter,
} from '@/lib/agent/types';
import { ProviderSort } from '@/lib/agent/types';

export function providerSortFromRoutePref(
  pref?: 'speed' | 'cost' | null,
): ProviderSort | undefined {
  if (pref === 'cost') return ProviderSort.Price;
  if (pref === 'speed') return ProviderSort.Throughput;
  return undefined;
}

export function pdfPlugins(hasPdf: boolean): PluginConfig[] | undefined {
  if (!hasPdf) return undefined;
  const pdfPlugin: PluginConfig = { id: 'file-parser', pdf: { engine: 'pdf-text' } };
  return [pdfPlugin];
}

export function composePlugins(opts: {
  hasPdf: boolean;
  searchEnabled?: boolean;
  searchProvider?: 'brave' | 'openrouter';
}): PluginConfig[] | undefined {
  const arr: PluginConfig[] = [];
  const base = pdfPlugins(opts.hasPdf);
  if (base && base.length) arr.push(...base);
  if (opts.searchEnabled && opts.searchProvider === 'openrouter') arr.push({ id: 'web' });
  return arr.length > 0 ? arr : undefined;
}

export type BuildChatBodyParams = {
  model: string;
  messages: unknown[];
  stream: boolean;
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  includeUsage?: boolean;
};

export function buildChatBody(params: BuildChatBodyParams) {
  const body: any = {
    model: params.model,
    messages: params.messages,
    stream: params.stream,
  };
  if (Array.isArray(params.modalities) && params.modalities.length)
    body.modalities = params.modalities;
  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (typeof params.top_p === 'number') body.top_p = params.top_p;
  if (typeof params.max_tokens === 'number') body.max_tokens = params.max_tokens;

  const reasoning: any = {};
  if (typeof params.reasoning_effort === 'string') reasoning.effort = params.reasoning_effort;
  if (typeof params.reasoning_tokens === 'number') reasoning.max_tokens = params.reasoning_tokens;
  if (Object.keys(reasoning).length) body.reasoning = reasoning;

  if (Array.isArray(params.tools) && params.tools.length) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice;
  if (typeof params.parallel_tool_calls === 'boolean')
    body.parallel_tool_calls = params.parallel_tool_calls;
  if (params.providerSort === ProviderSort.Price || params.providerSort === ProviderSort.Throughput) {
    body.provider = { ...(body.provider || {}), sort: params.providerSort };
  }
  if (Array.isArray(params.plugins) && params.plugins.length) body.plugins = params.plugins;
  if (params.includeUsage && params.stream) body.stream_options = { include_usage: true };
  return body;
}

export function buildDebugBody(args: {
  modelId: string;
  messages: unknown[];
  stream: boolean;
  includeUsage?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  canImageOut?: boolean;
}) {
  return buildChatBody({
    model: args.modelId,
    messages: args.messages,
    stream: args.stream,
    includeUsage: args.includeUsage,
    temperature: args.temperature,
    top_p: args.top_p,
    max_tokens: args.max_tokens,
    reasoning_effort: args.reasoningEffort,
    reasoning_tokens: args.reasoningTokens,
    tools: args.tools,
    tool_choice: args.toolChoice,
    parallel_tool_calls: args.parallelToolCalls,
    providerSort: args.providerSort,
    plugins: args.plugins,
    modalities: args.canImageOut ? (['image', 'text'] as Array<'image' | 'text'>) : undefined,
  });
}

export const DEBUG_LOG_TTL_MS = 1000 * 60 * 60 * 2;
export const DEBUG_LOG_MAX_ENTRIES = 50;

export function recordDebugIfEnabled(store: StoreAccess, messageId: string, body: unknown) {
  if (!messageId) return;
  if (!store.get().ui.debugMode) return;
  let payload = '';
  if (typeof body === 'string') {
    payload = body;
  } else {
    try {
      payload = JSON.stringify(body, null, 2);
    } catch (error) {
      payload = String(body);
    }
  }
  const now = Date.now();
  store.set((state) => {
    const existing = state.ui.debugByMessageId || {};
    const entries = Object.entries(existing).filter(([id, value]) => {
      if (id === messageId) return false;
      const createdAt = typeof value?.createdAt === 'number' ? value.createdAt : 0;
      return now - createdAt <= DEBUG_LOG_TTL_MS;
    });
    entries.push([messageId, { body: payload, createdAt: now }]);
    entries.sort((a, b) => (a[1].createdAt ?? 0) - (b[1].createdAt ?? 0));
    const trimmed = entries.slice(-DEBUG_LOG_MAX_ENTRIES);
    return {
      ui: {
        ...state.ui,
        debugByMessageId: Object.fromEntries(trimmed),
      },
    };
  });
}
