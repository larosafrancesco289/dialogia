import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import { ProviderSort } from '@/lib/models/providerSort';
import type { OpenRouterChatRequest, OpenRouterReasoning } from '@/lib/openrouter/types';

export type BuildChatBodyParams = {
  model: string;
  messages: ModelMessage[];
  stream: boolean;
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: OpenRouterChatRequest['tool_choice'];
  parallel_tool_calls?: boolean;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  includeUsage?: boolean;
};

export function buildChatBody(params: BuildChatBodyParams): OpenRouterChatRequest {
  const body: OpenRouterChatRequest = {
    model: params.model,
    messages: params.messages,
    stream: params.stream,
  };
  if (Array.isArray(params.modalities) && params.modalities.length)
    body.modalities = params.modalities;
  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (typeof params.top_p === 'number') body.top_p = params.top_p;
  if (typeof params.max_tokens === 'number') body.max_tokens = params.max_tokens;

  const reasoning: OpenRouterReasoning = {};
  if (typeof params.reasoning_effort === 'string') reasoning.effort = params.reasoning_effort;
  if (typeof params.reasoning_tokens === 'number') reasoning.max_tokens = params.reasoning_tokens;
  if (Object.keys(reasoning).length) body.reasoning = reasoning;

  if (Array.isArray(params.tools) && params.tools.length) body.tools = params.tools;
  if (params.tool_choice) body.tool_choice = params.tool_choice;
  if (typeof params.parallel_tool_calls === 'boolean')
    body.parallel_tool_calls = params.parallel_tool_calls;
  if (
    params.providerSort === ProviderSort.Price ||
    params.providerSort === ProviderSort.Throughput
  ) {
    body.provider = { ...(body.provider || {}), sort: params.providerSort };
  }
  if (Array.isArray(params.plugins) && params.plugins.length) body.plugins = params.plugins;
  if (params.includeUsage && params.stream) body.stream_options = { include_usage: true };
  return body;
}
