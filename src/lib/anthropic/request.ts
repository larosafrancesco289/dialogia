import type {
  ModelContentBlock,
  ModelMessage,
  PluginConfig,
  ToolDefinition,
} from '@/lib/transport/contracts';
import type { TransportChatParams } from '@/lib/transport/types';
import { isRecord } from '@/lib/utils/guards';
import {
  ANTHROPIC_DEFAULT_MAX_TOKENS,
  ANTHROPIC_MIN_THINKING_BUDGET,
  defaultAnthropicThinkingBudget,
  resolveAnthropicDirectModelId,
  supportsAnthropicAdaptiveThinking,
  supportsAnthropicPromptCaching,
  supportsAnthropicReasoning,
} from '@/lib/anthropic/shared';

type AnthropicCacheControl = {
  type: 'ephemeral';
};

type AnthropicTextBlock = {
  type: 'text';
  text: string;
  cache_control?: AnthropicCacheControl;
};

type AnthropicThinkingBlock = {
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

type AnthropicToolResultBlock = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
};

type AnthropicImageBlock = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string };
};

type AnthropicDocumentBlock = {
  type: 'document';
  source: { type: 'base64'; media_type: string; data: string };
  title?: string;
};

type AnthropicUserContentBlock =
  | AnthropicTextBlock
  | AnthropicImageBlock
  | AnthropicDocumentBlock
  | AnthropicToolResultBlock;

type AnthropicAssistantContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock
  | AnthropicServerToolUseBlock
  | AnthropicWebSearchToolResultBlock;

export type AnthropicAssistantMessageContent = string | AnthropicAssistantContentBlock[];

type AnthropicMessageParam =
  | { role: 'user'; content: string | AnthropicUserContentBlock[] }
  | { role: 'assistant'; content: AnthropicAssistantMessageContent };

type AnthropicToolChoice = { type: 'auto' } | { type: 'none' } | { type: 'tool'; name: string };

type AnthropicToolDefinition = {
  name: string;
  description: string | undefined;
  input_schema: Record<string, unknown>;
};

type AnthropicWebSearchToolDefinition = {
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
  output_config?: { effort: 'low' | 'medium' | 'high' };
};

const ANTHROPIC_WEB_SEARCH_TOOL: AnthropicWebSearchToolDefinition = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5,
};

function parseJsonObject(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseDataUrl(value: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!match) return null;
  return {
    mediaType: match[1],
    data: match[2],
  };
}

function convertImageBlock(block: Extract<ModelContentBlock, { type: 'image_url' }>) {
  const url = block.image_url?.url;
  if (typeof url !== 'string' || !url) return null;
  const dataUrl = parseDataUrl(url);
  if (dataUrl) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrl.mediaType,
        data: dataUrl.data,
      },
    } satisfies AnthropicImageBlock;
  }
  return {
    type: 'image',
    source: {
      type: 'url',
      url,
    },
  } satisfies AnthropicImageBlock;
}

function convertFileBlock(block: Extract<ModelContentBlock, { type: 'file' }>) {
  const fileData = block.file?.file_data;
  if (typeof fileData !== 'string' || !fileData) return null;
  const dataUrl = parseDataUrl(fileData);
  if (!dataUrl) return null;
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: dataUrl.mediaType,
      data: dataUrl.data,
    },
    title: block.file?.filename,
  } satisfies AnthropicDocumentBlock;
}

function normalizeTextContent(content: string | ModelContentBlock[] | null | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block): block is Extract<ModelContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
}

function convertUserContent(
  content: string | ModelContentBlock[],
): string | AnthropicUserContentBlock[] {
  if (typeof content === 'string') return content;
  const blocks: AnthropicUserContentBlock[] = [];
  for (const block of content) {
    if (block.type === 'text') {
      blocks.push(
        block.cache_control
          ? { type: 'text', text: block.text, cache_control: block.cache_control }
          : { type: 'text', text: block.text },
      );
      continue;
    }
    if (block.type === 'image_url') {
      const imageBlock = convertImageBlock(block);
      if (imageBlock) blocks.push(imageBlock);
      continue;
    }
    if (block.type === 'file') {
      const documentBlock = convertFileBlock(block);
      if (documentBlock) blocks.push(documentBlock);
      continue;
    }
  }
  if (blocks.length === 1 && blocks[0].type === 'text' && !blocks[0].cache_control) {
    return blocks[0].text;
  }
  return blocks;
}

function readAnthropicThinkingBlocks(value: unknown): AnthropicThinkingBlock[] | undefined {
  if (!isRecord(value)) return undefined;
  if (value.provider !== 'anthropic') return undefined;
  if (!Array.isArray(value.thinkingBlocks)) return undefined;
  const blocks = value.thinkingBlocks
    .map((entry) => {
      if (!isRecord(entry)) return null;
      if (entry.type !== 'thinking') return null;
      if (typeof entry.signature !== 'string') return null;
      return {
        type: 'thinking',
        thinking: typeof entry.thinking === 'string' ? entry.thinking : '',
        signature: entry.signature,
      } satisfies AnthropicThinkingBlock;
    })
    .filter((entry): entry is AnthropicThinkingBlock => entry !== null);
  return blocks.length > 0 ? blocks : undefined;
}

function convertAssistantContent(message: Extract<ModelMessage, { role: 'assistant' }>) {
  const blocks: AnthropicAssistantContentBlock[] = [];
  const thinkingBlocks = readAnthropicThinkingBlocks(message.reasoning_details);
  if (thinkingBlocks?.length) blocks.push(...thinkingBlocks);

  if (Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block.type !== 'text' || !block.text.trim()) continue;
      blocks.push(
        block.cache_control
          ? { type: 'text', text: block.text, cache_control: block.cache_control }
          : { type: 'text', text: block.text },
      );
    }
  } else {
    const text = normalizeTextContent(message.content);
    if (text.trim()) {
      blocks.push({ type: 'text', text });
    }
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const name = toolCall.function?.name;
      if (typeof name !== 'string' || !name) continue;
      blocks.push({
        type: 'tool_use',
        id: toolCall.id,
        name,
        input: parseJsonObject(toolCall.function.arguments),
      });
    }
  }

  if (blocks.length === 0) {
    return typeof message.content === 'string' ? message.content : '';
  }

  return blocks;
}

function convertToolResult(
  message: Extract<ModelMessage, { role: 'tool' }>,
): AnthropicToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: message.tool_call_id,
    content: message.content,
  };
}

function collectSystemTextBlocks(messages: ModelMessage[]): AnthropicTextBlock[] {
  const blocks: AnthropicTextBlock[] = [];
  for (const message of messages) {
    if (message.role !== 'system') continue;
    if (typeof message.content === 'string') {
      if (message.content) blocks.push({ type: 'text', text: message.content });
      continue;
    }
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === 'text') {
        blocks.push(
          block.cache_control
            ? { type: 'text', text: block.text, cache_control: block.cache_control }
            : { type: 'text', text: block.text },
        );
      }
    }
  }
  return blocks;
}

function convertMessages(messages: ModelMessage[]): {
  system?: string | AnthropicTextBlock[];
  messages: AnthropicMessageParam[];
} {
  const systemBlocks = collectSystemTextBlocks(messages);
  const hasSystemCacheControl = systemBlocks.some((block) => block.cache_control);
  const converted: AnthropicMessageParam[] = [];
  let pendingToolResults: AnthropicToolResultBlock[] = [];

  const flushToolResults = () => {
    if (pendingToolResults.length === 0) return;
    converted.push({ role: 'user', content: pendingToolResults.slice() });
    pendingToolResults = [];
  };

  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') {
      pendingToolResults.push(convertToolResult(message));
      continue;
    }

    flushToolResults();

    if (message.role === 'user') {
      converted.push({
        role: 'user',
        content: convertUserContent(message.content),
      });
      continue;
    }

    converted.push({
      role: 'assistant',
      content: convertAssistantContent(message),
    });
  }

  flushToolResults();

  return {
    system:
      systemBlocks.length === 0
        ? undefined
        : hasSystemCacheControl
          ? systemBlocks
          : systemBlocks.map((block) => block.text).join('\n\n'),
    messages: converted,
  };
}

function countExplicitCacheBreakpoints(params: {
  system?: string | AnthropicTextBlock[];
  messages: AnthropicMessageParam[];
}): number {
  let count = 0;

  if (Array.isArray(params.system)) {
    for (const block of params.system) {
      if (block.cache_control) count += 1;
    }
  }

  for (const message of params.messages) {
    if (!Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type === 'text' && block.cache_control) count += 1;
    }
  }

  return count;
}

function mapToolDefinitions(tools?: ToolDefinition[]): AnthropicToolDefinition[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools
    .map((tool) => {
      const fn = tool.function;
      if (!fn?.name) return null;
      return {
        name: fn.name,
        description: fn.description,
        input_schema: isRecord(fn.parameters) ? fn.parameters : { type: 'object', properties: {} },
      };
    })
    .filter((tool): tool is AnthropicToolDefinition => tool !== null);
}

function hasWebPlugin(plugins?: PluginConfig[]): boolean {
  return Array.isArray(plugins) && plugins.some((plugin) => plugin.id === 'web');
}

function mapToolChoice(
  toolChoice: TransportChatParams['toolChoice'],
): AnthropicToolChoice | undefined {
  if (!toolChoice) return undefined;
  if (toolChoice === 'auto') return { type: 'auto' };
  if (toolChoice === 'none') return { type: 'none' };
  return { type: 'tool', name: toolChoice.function.name };
}

function buildThinkingConfig(params: {
  model: string;
  reasoningEffort?: TransportChatParams['reasoningEffort'];
  reasoningTokens?: number;
  disableReasoning?: boolean;
}): Pick<AnthropicMessagesRequest, 'thinking' | 'output_config'> {
  const reasoningSupported = supportsAnthropicReasoning(params.model);
  if (!reasoningSupported) return {};

  const reasoningDisabled = params.disableReasoning || params.reasoningEffort === 'none';
  if (reasoningDisabled) return {};

  const reasoningRequested =
    (typeof params.reasoningEffort === 'string' && params.reasoningEffort !== 'none') ||
    (typeof params.reasoningTokens === 'number' && params.reasoningTokens > 0);

  if (!reasoningRequested) return {};

  if (supportsAnthropicAdaptiveThinking(params.model)) {
    const effort =
      params.reasoningEffort && params.reasoningEffort !== 'none' ? params.reasoningEffort : 'high';
    return {
      thinking: { type: 'adaptive', display: 'summarized' as const },
      output_config: { effort },
    };
  }

  const budgetFromEffort = defaultAnthropicThinkingBudget(
    params.reasoningEffort && params.reasoningEffort !== 'none'
      ? params.reasoningEffort
      : undefined,
  );
  const requestedBudget =
    typeof params.reasoningTokens === 'number' && Number.isFinite(params.reasoningTokens)
      ? params.reasoningTokens
      : budgetFromEffort;
  const budget_tokens = Math.max(ANTHROPIC_MIN_THINKING_BUDGET, Math.floor(requestedBudget));
  return {
    thinking: { type: 'enabled', budget_tokens, display: 'summarized' as const },
  };
}

export function buildAnthropicBody(
  params: Pick<
    TransportChatParams,
    | 'model'
    | 'messages'
    | 'temperature'
    | 'topP'
    | 'maxTokens'
    | 'reasoningEffort'
    | 'reasoningTokens'
    | 'disableReasoning'
    | 'tools'
    | 'toolChoice'
    | 'plugins'
  > & {
    stream: boolean;
    enableAutomaticCaching?: boolean;
  },
): AnthropicMessagesRequest {
  const resolvedModel = resolveAnthropicDirectModelId(params.model);
  if (!resolvedModel) {
    throw new Error(`Unsupported Anthropic model: ${params.model}`);
  }

  const { system, messages } = convertMessages(params.messages);
  const body: AnthropicMessagesRequest = {
    model: resolvedModel,
    messages,
    max_tokens: params.maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    stream: params.stream,
  };

  if (
    params.enableAutomaticCaching &&
    supportsAnthropicPromptCaching(resolvedModel) &&
    countExplicitCacheBreakpoints({ system, messages }) < 4
  ) {
    body.cache_control = { type: 'ephemeral' };
  }

  if (typeof params.temperature === 'number') body.temperature = params.temperature;
  if (typeof params.topP === 'number') body.top_p = params.topP;
  if (system !== undefined) body.system = system;

  const tools: Array<AnthropicToolDefinition | AnthropicWebSearchToolDefinition> =
    mapToolDefinitions(params.tools) ?? [];
  if (hasWebPlugin(params.plugins)) {
    tools.push(ANTHROPIC_WEB_SEARCH_TOOL);
  }
  if (tools?.length) body.tools = tools;
  const toolChoice = mapToolChoice(params.toolChoice);
  if (toolChoice) body.tool_choice = toolChoice;

  const thinkingConfig = buildThinkingConfig({
    model: resolvedModel,
    reasoningEffort: params.reasoningEffort,
    reasoningTokens: params.reasoningTokens,
    disableReasoning: params.disableReasoning,
  });
  if ('thinking' in thinkingConfig && thinkingConfig.thinking) {
    body.thinking = thinkingConfig.thinking;
  }
  if ('output_config' in thinkingConfig && thinkingConfig.output_config) {
    body.output_config = thinkingConfig.output_config;
  }

  return body;
}
