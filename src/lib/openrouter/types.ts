import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/transport/contracts';
import type { ProviderSort } from '@/lib/models/providerSort';
import type { ReasoningEffort } from '@/lib/types/enums';

export type OpenRouterReasoning = {
  effort?: ReasoningEffort;
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
  provider?: { sort?: ProviderSort; zdr?: boolean };
  plugins?: PluginConfig[];
  stream_options?: { include_usage?: boolean };
};
