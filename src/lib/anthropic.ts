import type { ORModel } from '@/lib/types';
import type { ModelMessage, ToolDefinition, ToolCall } from '@/lib/agent/types';
import type { ChatCompletionPayload } from '@/lib/api/openrouterClient';
import { anthropicFetchModels, anthropicMessages } from '@/lib/api/anthropicClient';
import { responseError, API_ERROR_CODES, ApiError } from '@/lib/api/errors';
import { consumeSse } from '@/lib/api/stream';

type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source:
        | { type: 'base64'; media_type: string; data: string }
        | { type: 'url'; url: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content?: Array<{ type: 'text'; text: string }>; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
};

type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

type AnthropicResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage?: AnthropicUsage;
};

const DEFAULT_MAX_TOKENS = 1024;
const ANTHROPIC_ID_PREFIX = /^anthropic[#:/]/i;

function toAnthropicModelId(appModelId: string): string {
  if (!appModelId) return appModelId;
  if (ANTHROPIC_ID_PREFIX.test(appModelId)) {
    return appModelId.replace(ANTHROPIC_ID_PREFIX, '');
  }
  return appModelId;
}

function parseJson(value: string | undefined): any {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function convertToolDefinition(tool: ToolDefinition): AnthropicToolDefinition | null {
  if (!tool?.function?.name) return null;
  const input_schema =
    (tool.function.parameters && typeof tool.function.parameters === 'object'
      ? tool.function.parameters
      : { type: 'object', properties: {} }) ?? { type: 'object', properties: {} };
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema,
  };
}

function convertToolChoice(choice: 'auto' | 'none' | { type: 'function'; function: { name: string } } | undefined) {
  if (!choice) return undefined;
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'none') return { type: 'none' };
  if (typeof choice === 'object' && choice?.function?.name) {
    return { type: 'tool', name: choice.function.name };
  }
  return undefined;
}

function isDataUrl(url?: string): boolean {
  return typeof url === 'string' && url.startsWith('data:');
}

function extractBase64FromDataUrl(url?: string): { mediaType: string; data: string } | null {
  if (!url) return null;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(url);
  if (!match) return null;
  return { mediaType: match[1], data: match[2] };
}

function convertModelContentToAnthropic(content: ModelMessage['content']): AnthropicContentBlock[] {
  if (content == null) return [];
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? [{ type: 'text', text: trimmed }] : [];
  }
  if (!Array.isArray(content)) return [];
  const results: AnthropicContentBlock[] = [];
  for (const block of content) {
    if (!block) continue;
    if (block.type === 'text') {
      if (block.text?.trim()) results.push({ type: 'text', text: block.text });
      continue;
    }
    if (block.type === 'image_url') {
      const url = block.image_url?.url;
      if (!url) continue;
      if (isDataUrl(url)) {
        const parsed = extractBase64FromDataUrl(url);
        if (parsed) {
          results.push({
            type: 'image',
            source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
          });
        }
      } else {
        results.push({ type: 'image', source: { type: 'url', url } });
      }
      continue;
    }
    if (block.type === 'file') {
      // Files (e.g., PDFs) are not yet supported for direct Anthropics calls; skip for now.
      continue;
    }
    if (block.type === 'input_audio') {
      // Audio inputs not yet supported for Anthropics transport.
      continue;
    }
  }
  return results;
}

function partitionSystemMessages(messages: ModelMessage[]): { system?: string; rest: ModelMessage[] } {
  const rest: ModelMessage[] = [];
  const systemParts: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string' && msg.content.trim()) {
        systemParts.push(msg.content.trim());
      } else if (Array.isArray(msg.content)) {
        const text = msg.content
          .map((block) => (block.type === 'text' ? block.text : ''))
          .filter(Boolean)
          .join('\n');
        if (text.trim()) systemParts.push(text.trim());
      }
      continue;
    }
    rest.push(msg);
  }
  const system = systemParts.length ? systemParts.join('\n\n') : undefined;
  return { system, rest };
}

function toAnthropicMessages(messages: ModelMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'tool') {
      const blocks: AnthropicContentBlock[] = [
        {
          type: 'tool_result',
          tool_use_id: (msg as any).tool_call_id || 'tool',
          content: msg.content
            ? [
                {
                  type: 'text',
                  text: typeof msg.content === 'string' ? msg.content : String(msg.content),
                },
              ]
            : undefined,
        },
      ];
      out.push({ role: 'user', content: blocks });
      continue;
    }
    if (msg.role === 'assistant') {
      const blocks = convertModelContentToAnthropic(msg.content);
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
        for (const toolCall of msg.tool_calls as ToolCall[]) {
          const args =
            typeof toolCall.function?.arguments === 'string'
              ? parseJson(toolCall.function.arguments)
              : toolCall.function?.arguments || {};
          blocks.push({
            type: 'tool_use',
            id: toolCall.id || toolCall.function?.name || `tool_${blocks.length}`,
            name: toolCall.function?.name || 'tool',
            input: args,
          });
        }
      }
      out.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '' }] });
      continue;
    }
    if (msg.role === 'user') {
      const blocks = convertModelContentToAnthropic(msg.content);
      if (!blocks.length && typeof msg.content === 'string') {
        blocks.push({ type: 'text', text: msg.content });
      }
      out.push({ role: 'user', content: blocks.length ? blocks : [{ type: 'text', text: '' }] });
      continue;
    }
  }
  return out;
}

function anthropicUsageToOpenAI(usage?: AnthropicUsage) {
  if (!usage) return undefined;
  return {
    prompt_tokens: usage.input_tokens,
    completion_tokens: usage.output_tokens,
    total_tokens:
      typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number'
        ? usage.input_tokens + usage.output_tokens
        : undefined,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  };
}

function extractTextFromContent(blocks: AnthropicContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && block.text) parts.push(block.text);
  }
  return parts.join('');
}

function extractToolCalls(blocks: AnthropicContentBlock[]): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const block of blocks) {
    if (block.type !== 'tool_use') continue;
    calls.push({
      id: block.id,
      type: 'function',
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      },
    });
  }
  return calls;
}

function toChatCompletionPayload(payload: AnthropicResponse, appModelId: string): ChatCompletionPayload {
  const messageContent = extractTextFromContent(payload.content);
  const toolCalls = extractToolCalls(payload.content);
  return {
    id: payload.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: appModelId,
    choices: [
      {
        index: 0,
        finish_reason: payload.stop_reason ?? 'stop',
        message: {
          role: 'assistant',
          content: messageContent,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        },
      },
    ],
    usage: anthropicUsageToOpenAI(payload.usage),
  };
}

export async function fetchModels(
  apiKey: string | undefined,
  opts: { signal?: AbortSignal; origin?: string } = {},
): Promise<ORModel[]> {
  const res = await anthropicFetchModels(apiKey, opts);
  if (res.status === 401 || res.status === 403) {
    throw responseError(res, {
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid Anthropics API key',
    });
  }
  if (!res.ok) {
    throw responseError(res, { code: API_ERROR_CODES.PROVIDER_MODELS_FAILED });
  }
  const data = await res.json().catch(() => null);
  const items: any[] = Array.isArray(data?.data) ? data.data : [];
  return items.map((entry) => {
    const rawId = typeof entry?.id === 'string' ? entry.id : '';
    const canonicalId = rawId.includes('/') ? rawId : `anthropic/${rawId}`;
    return {
      id: canonicalId,
      name: entry.display_name || entry.id,
      raw: entry,
      transport: 'anthropic' as const,
      transportModelId: rawId,
      providerDisplay: 'Anthropic',
    };
  });
}

type ChatParams = {
  apiKey: string;
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  signal?: AbortSignal;
};

export async function chatCompletion(params: ChatParams): Promise<ChatCompletionPayload> {
  const { system, rest } = partitionSystemMessages(params.messages);
  const anthropicMessagesPayload = toAnthropicMessages(rest);
  const tools =
    Array.isArray(params.tools) && params.tools.length
      ? params.tools.map(convertToolDefinition).filter(Boolean)
      : undefined;
  const body: any = {
    model: toAnthropicModelId(params.model),
    max_tokens: params.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: anthropicMessagesPayload,
    temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
    top_p: typeof params.top_p === 'number' ? params.top_p : undefined,
    system,
    tools,
    tool_choice: convertToolChoice(params.tool_choice),
  };
  const res = await anthropicMessages({
    apiKey: params.apiKey,
    body,
    signal: params.signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw responseError(res, {
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid Anthropics API key',
    });
  }
  if (res.status === 429) {
    throw responseError(res, { code: API_ERROR_CODES.RATE_LIMITED, message: 'Anthropic rate limited' });
  }
  if (!res.ok) {
    throw responseError(res, { code: API_ERROR_CODES.PROVIDER_CHAT_FAILED });
  }
  const payload = (await res.json()) as AnthropicResponse;
  return toChatCompletionPayload(payload, params.model);
}

type StreamParams = ChatParams & {
  callbacks?: {
    onStart?: () => void;
    onToken?: (delta: string) => void;
    onReasoningToken?: (delta: string) => void;
    onDone?: (full: string, extras?: { usage?: ReturnType<typeof anthropicUsageToOpenAI> }) => void;
    onError?: (err: Error) => void;
  };
};

export async function streamChatCompletion(params: StreamParams): Promise<void> {
  const { system, rest } = partitionSystemMessages(params.messages);
  const anthropicMessagesPayload = toAnthropicMessages(rest);
  const tools =
    Array.isArray(params.tools) && params.tools.length
      ? params.tools.map(convertToolDefinition).filter(Boolean)
      : undefined;
  const body: any = {
    model: toAnthropicModelId(params.model),
    max_tokens: params.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: anthropicMessagesPayload,
    temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
    top_p: typeof params.top_p === 'number' ? params.top_p : undefined,
    system,
    tools,
    tool_choice: convertToolChoice(params.tool_choice),
    stream: true,
  };
  const res = await anthropicMessages({
    apiKey: params.apiKey,
    body,
    signal: params.signal,
    stream: true,
  });
  if (res.status === 401 || res.status === 403) {
    throw responseError(res, {
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Invalid Anthropics API key',
    });
  }
  if (res.status === 429) {
    throw responseError(res, { code: API_ERROR_CODES.RATE_LIMITED, message: 'Anthropic rate limited' });
  }
  if (!res.ok || !res.body) {
    throw responseError(res, { code: API_ERROR_CODES.PROVIDER_CHAT_FAILED });
  }

  let full = '';
  let usage: ReturnType<typeof anthropicUsageToOpenAI> | undefined;
  const callbacks = params.callbacks;

  await consumeSse(res, {
    onStart: () => callbacks?.onStart?.(),
    onMessage: ({ data }) => {
      try {
        const event = JSON.parse(data);
        switch (event.type) {
          case 'content_block_delta':
            if (event.delta?.type === 'text_delta' && typeof event.delta?.text === 'string') {
              full += event.delta.text;
              callbacks?.onToken?.(event.delta.text);
            } else if (event.delta?.type === 'thinking_delta' && typeof event.delta?.text === 'string') {
              callbacks?.onReasoningToken?.(event.delta.text);
            }
            break;
          case 'message_delta':
            usage = anthropicUsageToOpenAI(event.usage);
            break;
          case 'error':
            callbacks?.onError?.(new Error(event.error?.message || 'Anthropic stream error'));
            break;
          default:
            break;
        }
      } catch (err) {
        callbacks?.onError?.(err as Error);
      }
    },
    onDone: () => {
      callbacks?.onDone?.(full, { usage });
    },
  });
}
