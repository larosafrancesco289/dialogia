import { buildDebugBody, captureDebugPayload } from '@/lib/agent/request';
import type { ProviderSort } from '@/lib/models/providerSort';
import type { PluginConfig, ToolDefinition, TurnContext } from '@/lib/agent/types';

export type RequestDebugOptions = {
  modelId: string;
  messages: unknown[];
  stream: boolean;
  includeUsage?: boolean;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
  reasoningTokens?: number;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallelToolCalls?: boolean;
  providerSort?: ProviderSort;
  plugins?: PluginConfig[];
  canImageOut?: boolean;
};

export function buildRequestDebugBody(options: RequestDebugOptions) {
  return buildDebugBody({
    modelId: options.modelId,
    messages: options.messages,
    stream: options.stream,
    includeUsage: options.includeUsage,
    temperature: options.temperature,
    top_p: options.topP,
    max_tokens: options.maxTokens,
    reasoningEffort: options.reasoningEffort,
    reasoningTokens: options.reasoningTokens,
    tools: options.tools,
    toolChoice: options.toolChoice,
    parallelToolCalls: options.parallelToolCalls,
    providerSort: options.providerSort,
    plugins: options.plugins,
    canImageOut: options.canImageOut,
  });
}

export function captureRequestDebug({
  turn,
  messageId,
  ...rest
}: { turn: TurnContext; messageId: string } & RequestDebugOptions) {
  captureDebugPayload(turn, messageId, () => buildRequestDebugBody(rest));
}
