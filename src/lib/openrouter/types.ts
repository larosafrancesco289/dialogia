import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import type { ProviderSort } from '@/lib/models/providerSort';

export type OpenRouterReasoning = {
  effort?: 'none' | 'low' | 'medium' | 'high';
  max_tokens?: number;
  exclude?: boolean;
};

export type OpenRouterChatRequest = {
  model: string;
  messages: ModelMessage[];
  stream: boolean;
  modalities?: Array<'image' | 'text'>;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  reasoning?: OpenRouterReasoning;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parallel_tool_calls?: boolean;
  provider?: { sort?: ProviderSort };
  plugins?: PluginConfig[];
  stream_options?: { include_usage?: boolean };
};
