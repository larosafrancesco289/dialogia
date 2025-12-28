import type { ToolCall } from '@/lib/agent/types';
import { anthropicMessages } from '@/lib/api/anthropicClient';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { fromAnthropicUsage } from '@/lib/api/normalizers';
import type { ChatCompletion } from '@/lib/transport/completions';
import type { TransportChatParams } from '@/lib/transport/types';
import type {
  AnthropicContentBlock,
  AnthropicMessagesRequest,
  AnthropicToolDefinition,
} from '@/lib/types/transport';
import { buildAnthropicError, wrapAnthropicClientError } from '@/lib/anthropic/errors';
import {
  DEFAULT_MAX_TOKENS,
  convertToolChoice,
  convertToolDefinition,
  partitionSystemMessages,
  toAnthropicMessages,
  toAnthropicModelId,
} from '@/lib/anthropic/shared';

type AnthropicResponse = {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

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

function toChatCompletion(payload: AnthropicResponse, appModelId: string): ChatCompletion {
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
    usage: fromAnthropicUsage(payload.usage),
  };
}

type ChatParams = TransportChatParams;

export async function chatCompletion(params: ChatParams): Promise<ChatCompletion> {
  const { system, rest } = partitionSystemMessages(params.messages);
  const anthropicMessagesPayload = toAnthropicMessages(rest);
  const tools =
    Array.isArray(params.tools) && params.tools.length
      ? params.tools
          .map(convertToolDefinition)
          .filter((tool): tool is AnthropicToolDefinition => Boolean(tool))
      : undefined;
  const body: AnthropicMessagesRequest = {
    model: toAnthropicModelId(params.model),
    max_tokens: params.max_tokens ?? DEFAULT_MAX_TOKENS,
    messages: anthropicMessagesPayload,
    temperature: typeof params.temperature === 'number' ? params.temperature : undefined,
    top_p: typeof params.top_p === 'number' ? params.top_p : undefined,
    system,
    tools,
    tool_choice: convertToolChoice(params.tool_choice),
  };
  let res: Response;
  try {
    res = await anthropicMessages({
      apiKey: params.apiKey,
      body,
      signal: params.signal,
      origin: params.origin,
    });
  } catch (error) {
    throw wrapAnthropicClientError(error, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
  }
  if (res.status === 401 || res.status === 403) {
    throw await buildAnthropicError(
      res,
      API_ERROR_CODES.UNAUTHORIZED,
      'Invalid Anthropics API key',
    );
  }
  if (res.status === 429) {
    throw await buildAnthropicError(res, API_ERROR_CODES.RATE_LIMITED, 'Anthropic rate limited');
  }
  if (!res.ok) {
    throw await buildAnthropicError(res, API_ERROR_CODES.PROVIDER_CHAT_FAILED);
  }
  const payload = (await res.json()) as AnthropicResponse;
  return toChatCompletion(payload, params.model);
}
