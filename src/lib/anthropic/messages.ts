// Module: anthropic/messages
// Responsibility: Convert the app's model messages into Messages API messages:
// the system prompt lifted out, attachments as image and document blocks, and
// tool rounds as tool_use / tool_result blocks.

import type { ModelContentBlock, ModelMessage } from '@/lib/transport/contracts';
import { isRecord } from '@/lib/utils/guards';
import type {
  AnthropicAssistantContentBlock,
  AnthropicDocumentBlock,
  AnthropicImageBlock,
  AnthropicMessageParam,
  AnthropicTextBlock,
  AnthropicThinkingBlock,
  AnthropicToolResultBlock,
  AnthropicUserContentBlock,
} from '@/lib/anthropic/wire';

/**
 * A tool call's JSON arguments as the object a tool_use block's `input` must
 * be. Empty, malformed or non-object JSON reads as no arguments.
 */
export function parseToolInput(value: string | undefined): Record<string, unknown> {
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

/** Content the Messages API has no block type for, reported so nothing vanishes quietly. */
export type UnsupportedContentKind = 'audio';

function convertUserContent(
  content: string | ModelContentBlock[],
  unsupported: Set<UnsupportedContentKind>,
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
    if (block.type === 'input_audio') {
      // The Messages API has no audio input block; the caller surfaces this.
      unsupported.add('audio');
      continue;
    }
  }
  if (blocks.length === 1 && blocks[0].type === 'text' && !blocks[0].cache_control) {
    return blocks[0].text;
  }
  return blocks;
}

/**
 * How a reply's thinking is kept on the message (`reasoning_details`), so the
 * next request can send it back as the Messages API requires during tool use.
 */
type AnthropicReasoningDetails = {
  provider: 'anthropic';
  thinkingBlocks: AnthropicThinkingBlock[];
};

/** The signed thinking blocks in a list. An unsigned block cannot be sent back. */
export function pickThinkingBlocks(entries: unknown[]): AnthropicThinkingBlock[] {
  return entries
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
}

export function toReasoningDetails(
  thinkingBlocks: AnthropicThinkingBlock[],
): AnthropicReasoningDetails | undefined {
  return thinkingBlocks.length > 0 ? { provider: 'anthropic', thinkingBlocks } : undefined;
}

function readReasoningDetails(value: unknown): AnthropicThinkingBlock[] {
  if (!isRecord(value)) return [];
  if (value.provider !== 'anthropic') return [];
  if (!Array.isArray(value.thinkingBlocks)) return [];
  return pickThinkingBlocks(value.thinkingBlocks);
}

function convertAssistantContent(message: Extract<ModelMessage, { role: 'assistant' }>) {
  const blocks: AnthropicAssistantContentBlock[] = [];
  blocks.push(...readReasoningDetails(message.reasoning_details));

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
        input: parseToolInput(toolCall.function.arguments),
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

export function convertMessages(
  messages: ModelMessage[],
  unsupported: Set<UnsupportedContentKind>,
): {
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

    if (message.role === 'user') {
      const content = convertUserContent(message.content, unsupported);
      if (pendingToolResults.length > 0) {
        // Tool results and the user's next words share one user turn, results
        // first, as the Messages API expects.
        const blocks: AnthropicUserContentBlock[] =
          typeof content === 'string'
            ? content.trim()
              ? [{ type: 'text', text: content }]
              : []
            : content;
        converted.push({ role: 'user', content: [...pendingToolResults, ...blocks] });
        pendingToolResults = [];
        continue;
      }
      converted.push({ role: 'user', content });
      continue;
    }

    flushToolResults();

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
