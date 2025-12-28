import type { ModelContentBlock, ToolCall } from '@/lib/agent/types';

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
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
