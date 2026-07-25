import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import { ProviderSort } from '@/lib/models/providerSort';
import type { OpenRouterChatRequest, OpenRouterReasoning } from '@/lib/openrouter/types';
import type { EndpointCapabilities } from '@/lib/transport/endpoints';
import type { ReasoningEffort } from '@/lib/types/enums';

export type BuildChatBodyParams = {
  model: string;
  messages: ModelMessage[];
  stream: boolean;
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  reasoningTokens?: number;
  disableReasoning?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: OpenRouterChatRequest['tool_choice'];
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  zdrOnly?: boolean;
  plugins?: PluginConfig[];
  includeUsage?: boolean;
  /**
   * Present only for user-configured endpoints. An ungated field is never
   * emitted: a strict OpenAI-compatible server rejects the whole request over
   * one unknown key, so silence beats optimism here.
   */
  capabilities?: EndpointCapabilities;
  /** OpenRouter-only routing controls (`provider`, `plugins`, `modalities`). */
  allowProviderExtensions?: boolean;
};

export function buildChatBody(params: BuildChatBodyParams): OpenRouterChatRequest {
  const caps = params.capabilities;
  const allow = (name: keyof EndpointCapabilities): boolean => !caps || caps[name] === true;
  const allowExtensions = params.allowProviderExtensions ?? !caps;

  const body: OpenRouterChatRequest = {
    model: params.model,
    messages: params.messages,
    stream: params.stream,
  };
  if (allowExtensions && Array.isArray(params.modalities) && params.modalities.length)
    body.modalities = params.modalities;
  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (typeof params.topP === 'number') body.top_p = params.topP;
  if (typeof params.maxTokens === 'number') body.max_tokens = params.maxTokens;

  if (allow('reasoning')) {
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
  }

  if (allow('tools')) {
    if (Array.isArray(params.tools) && params.tools.length) body.tools = params.tools;
    if (params.toolChoice) body.tool_choice = params.toolChoice;
    if (typeof params.parallelToolCalls === 'boolean' && allow('parallelToolCalls'))
      body.parallel_tool_calls = params.parallelToolCalls;
  }

  if (allowExtensions) {
    if (
      params.providerSort === ProviderSort.Price ||
      params.providerSort === ProviderSort.Throughput
    ) {
      body.provider = { ...(body.provider || {}), sort: params.providerSort };
    }
    if (params.zdrOnly) {
      body.provider = { ...(body.provider || {}), zdr: true };
    }
    if (Array.isArray(params.plugins) && params.plugins.length) body.plugins = params.plugins;
  }

  if (params.includeUsage && params.stream && allow('streamUsage'))
    body.stream_options = { include_usage: true };
  return body;
}
