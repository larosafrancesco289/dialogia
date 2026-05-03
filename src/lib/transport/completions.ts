import type { ModelContentBlock, ToolCall } from '@/lib/transport/contracts';

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  prompt_tokens_details?: Record<string, unknown>;
  completion_tokens_details?: Record<string, unknown>;
  cost?: number;
  cost_details?: Record<string, unknown>;
  cache_discount?: number;
  server_tool_use?: Record<string, unknown>;
  is_byok?: boolean;
  [key: string]: unknown;
};

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ModelContentBlock[] | null;
  tool_calls?: ToolCall[];
  annotations?: unknown;
};

export type ChatCompletionChoice = {
  index: number;
  finish_reason?: string | null;
  message: ChatCompletionMessage;
};

export type ChatCompletion = {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
};
