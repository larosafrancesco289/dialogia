import type { ModelMessage, PluginConfig, ToolDefinition } from '@/lib/agent/types';
import type { ProviderSort } from '@/lib/models/providerSort';

export type OpenRouterReasoning = {
  effort?: 'none' | 'low' | 'medium' | 'high';
  max_tokens?: number;
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

export type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'none' }
  | { type: 'tool'; name: string };

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content?: Array<{ type: 'text'; text: string }>;
      is_error?: boolean;
    }
  | { type: 'thinking'; thinking: string };

export type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
};

export type AnthropicMessagesRequest = {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  temperature?: number;
  top_p?: number;
  system?: string;
  tools?: AnthropicToolDefinition[];
  tool_choice?: AnthropicToolChoice;
  stream?: boolean;
};
