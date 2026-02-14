import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import { ProviderSort } from '@/lib/models/providerSort';
import type { OpenRouterChatRequest, OpenRouterReasoning } from '@/lib/openrouter/types';

export type BuildChatBodyParams = {
  model: string;
  messages: ModelMessage[];
  stream: boolean;
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  disableReasoning?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: OpenRouterChatRequest['tool_choice'];
  parallelToolCalls?: boolean;
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
  if (typeof params.topP === 'number') body.top_p = params.topP;
  if (typeof params.maxTokens === 'number') body.max_tokens = params.maxTokens;

  const reasoning: OpenRouterReasoning = {};
  const hasReasoningTokens =
    typeof params.reasoningTokens === 'number' && Number.isFinite(params.reasoningTokens)
      ? params.reasoningTokens > 0
      : false;

  if (params.disableReasoning || params.reasoningEffort === 'none') {
    // Force-disable reasoning. Avoid `exclude` because that still allows internal thinking.
    reasoning.effort = 'none';
  } else if (typeof params.reasoningEffort === 'string') {
    // OpenRouter expects either effort or max_tokens, not both.
    reasoning.effort = params.reasoningEffort;
  } else if (hasReasoningTokens) {
    reasoning.max_tokens = params.reasoningTokens;
  }

  if (Object.keys(reasoning).length) body.reasoning = reasoning;

  if (Array.isArray(params.tools) && params.tools.length) body.tools = params.tools;
  if (params.toolChoice) body.tool_choice = params.toolChoice;
  if (typeof params.parallelToolCalls === 'boolean')
    body.parallel_tool_calls = params.parallelToolCalls;
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
