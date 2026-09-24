// Module: anthropic/wire
// Responsibility: The Messages API's request shapes, as this client sends them.

type AnthropicCacheControl = {
  type: 'ephemeral';
};

export type AnthropicTextBlock = {
  type: 'text';
  text: string;
  cache_control?: AnthropicCacheControl;
};

export type AnthropicThinkingBlock = {
  type: 'thinking';
  thinking: string;
  signature: string;
};

type AnthropicToolUseBlock = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type AnthropicServerToolUseBlock = {
  type: 'server_tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};

type AnthropicWebSearchToolResultBlock = {
  type: 'web_search_tool_result';
  tool_use_id: string;
  content: Array<Record<string, unknown>>;
};

export type AnthropicToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
};

export type AnthropicImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
};

export type AnthropicDocumentBlock = {
  type: 'document';
  source: { type: 'base64'; media_type: string; data: string };
  title?: string;
};

export type AnthropicUserContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock
  | AnthropicToolResultBlock;

export type AnthropicAssistantContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock
  | AnthropicServerToolUseBlock
  | AnthropicWebSearchToolResultBlock;

export type AnthropicAssistantMessageContent = string | AnthropicAssistantContentBlock[];

export type AnthropicMessageParam =
  | { role: 'user'; content: string | AnthropicUserContentBlock[] }
  | { role: 'assistant'; content: AnthropicAssistantMessageContent };

export type AnthropicToolChoice =
  | { type: 'auto' }
  | { type: 'none' }
  | { type: 'tool'; name: string };

export type AnthropicToolDefinition = {
  name: string;
  description: string | undefined;
  input_schema: Record<string, unknown>;
};

export type AnthropicWebSearchToolDefinition = {
  type: 'web_search_20250305';
  name: 'web_search';
  max_uses: number;
};

export type AnthropicMessagesRequest = {
  model: string;
  messages: AnthropicMessageParam[];
  max_tokens: number;
  stream?: boolean;
  cache_control?: AnthropicCacheControl;
  temperature?: number;
  top_p?: number;
  system?: string | AnthropicTextBlock[];
  tools?: Array<AnthropicToolDefinition | AnthropicWebSearchToolDefinition>;
  tool_choice?: AnthropicToolChoice;
  thinking?:
    | { type: 'adaptive'; display?: 'summarized' | 'omitted' }
    | { type: 'enabled'; budget_tokens: number; display?: 'summarized' | 'omitted' };
  output_config?: { effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' };
};
