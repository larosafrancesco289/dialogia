export type ModelContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } };

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
  // Allow provider-specific extra fields (e.g., Gemini's thought_signature)
  [key: string]: unknown;
};

export type SystemModelMessage = {
  role: 'system';
  content: string;
};

export type UserModelMessage = {
  role: 'user';
  content: string | ModelContentBlock[];
  name?: string;
};

export type AssistantModelMessage = {
  role: 'assistant';
  content: string | ModelContentBlock[] | null;
  name?: string;
  annotations?: unknown;
  tool_calls?: ToolCall[];
  // reasoning_details is required by Gemini, Claude, and other reasoning models
  // when preserving thought signatures across tool call roundtrips
  reasoning_details?: unknown;
};

export type ToolModelMessage = {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name?: string;
};

export type ModelMessage =
  | SystemModelMessage
  | UserModelMessage
  | AssistantModelMessage
  | ToolModelMessage;

export type PdfPluginConfig = {
  id: 'file-parser';
  pdf: { engine: 'pdf-text' };
};

export type WebPluginConfig = {
  id: 'web';
};

export type PluginConfig = PdfPluginConfig | WebPluginConfig;

export type ToolFunctionDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export type ToolDefinition = {
  type: 'function';
  function: ToolFunctionDefinition;
};
