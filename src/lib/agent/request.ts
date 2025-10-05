// Module: agent/request
// Responsibility: Centralize request-building utilities for OpenRouter flows.
// - Map UI route preference to provider sort
// - Compose plugins for PDF parsing and OpenRouter web plugin
// - Build a debug request body used in debug panels

import type { StoreState } from '@/lib/store/types';
import { isImageOutputSupported, isReasoningSupported } from '@/lib/models';
import type { PluginConfig, ToolDefinition, StoreSetter, StoreGetter } from '@/lib/agent/types';

export type ProviderSort = 'price' | 'throughput' | undefined;

export type StoreAccess = { set: StoreSetter; get: StoreGetter };

export function providerSortFromRoutePref(pref?: 'speed' | 'cost' | null): ProviderSort {
  if (pref === 'cost') return 'price';
  if (pref === 'speed') return 'throughput';
  return undefined;
}

export function pdfPlugins(hasPdf: boolean): PluginConfig[] | undefined {
  if (!hasPdf) return undefined;
  return [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
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
  if (params.providerSort === 'price' || params.providerSort === 'throughput') {
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

export function maybeRecordDebug(store: StoreAccess, messageId: string, body: unknown) {
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
  store.set((state) => ({
    ui: {
      ...state.ui,
      debugByMessageId: {
        ...(state.ui.debugByMessageId || {}),
        [messageId]: { body: payload, createdAt: Date.now() },
      },
    },
  }));
}
