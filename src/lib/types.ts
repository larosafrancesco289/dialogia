export type ChatSettings = {
  model: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  system?: string;
  // OpenRouter reasoning controls (for thinking models)
  reasoning_effort?: 'none' | 'low' | 'medium' | 'high';
  reasoning_tokens?: number; // max reasoning tokens (optional)
  show_thinking_by_default?: boolean; // UI preference only
  show_stats?: boolean; // UI preference only
  // Optional web search augmentation using Brave Search API
  search_with_brave?: boolean;
};

export type Message = {
  id: string;
  chatId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: number;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  // For thinking models; accumulated via streaming
  reasoning?: string;
  metrics?: MessageMetrics;
};

export type MessageMetrics = {
  ttftMs?: number; // time to first token (ms)
  completionMs?: number; // total time until done (ms)
  promptTokens?: number;
  completionTokens?: number;
  tokensPerSec?: number; // actual throughput when usage present
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  settings: ChatSettings;
  folderId?: string; // Optional folder association
};

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  isExpanded: boolean;
  parentId?: string; // Optional for nested folders
};

export type ORModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: number; completion?: number; currency?: string };
  raw?: any;
};

export type KVRecord = {
  key: string;
  value: any;
};
