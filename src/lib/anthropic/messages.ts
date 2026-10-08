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
 * `content` is the whole reply as it arrived, which is what goes back when
 * present: thinking is bound to what came before it, so the message is echoed
 * block for block rather than rebuilt from its text and calls.
 */
type AnthropicReasoningDetails = {
  provider: 'anthropic';
  thinkingBlocks: AnthropicThinkingBlock[];
  content?: Array<Record<string, unknown>>;
  /** The code execution container the reply ran code in (web search's filtering does). */
  container?: string;
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
  content: Array<Record<string, unknown>> = [],
  container?: string,
): AnthropicReasoningDetails | undefined {
  if (thinkingBlocks.length === 0 && content.length === 0) return undefined;
  return {
    provider: 'anthropic',
    thinkingBlocks,
    ...(content.length > 0 ? { content } : {}),
    ...(container ? { container } : {}),
  };
}

/** The id of a response's `container`, the code execution sandbox it ran code in. */
export function readContainerId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.id === 'string' && value.id ? value.id : undefined;
}

/**
 * The container a request must name to resume code a reply left running: the
 * conversation ends in an assistant reply and the results of its tool calls,
 * and the reply holds a server tool call with no result yet (web search
 * filtering in code, paused while the app runs its own tools). Undefined
 * otherwise, since naming a container that has since expired is an error.
 */
export function pendingCodeContainer(messages: ModelMessage[]): string | undefined {
  let index = messages.length - 1;
  while (index >= 0 && messages[index].role === 'tool') index -= 1;
  const reply = messages[index];
  if (index === messages.length - 1 || reply?.role !== 'assistant') return undefined;
  const details = reply.reasoning_details;
  if (!isRecord(details) || details.provider !== 'anthropic') return undefined;
  if (typeof details.container !== 'string' || !details.container) return undefined;
  const content = Array.isArray(details.content) ? details.content.filter(isRecord) : [];
  const answered = new Set(content.map((block) => block.tool_use_id));
  const pending = content.some(
    (block) => block.type === 'server_tool_use' && !answered.has(block.id),
  );
  return pending ? details.container : undefined;
}

const isThinking = (block: Record<string, unknown>) =>
  block.type === 'thinking' || block.type === 'redacted_thinking';

/**
 * A reply's reasoning details with its thinking taken out, for a request
 * whose system prompt or tools changed since the thinking was produced:
 * the model would reject it. Every other block stays. Details in another
 * provider's shape hold nothing but reasoning, so none of them are kept.
 */
export function withoutThinking(details: unknown): unknown {
  if (!isRecord(details) || details.provider !== 'anthropic') return undefined;
  const content = Array.isArray(details.content)
    ? details.content.filter((block) => isRecord(block) && !isThinking(block))
    : [];
  if (content.length === 0) return undefined;
  const container = typeof details.container === 'string' ? details.container : undefined;
  return {
    provider: 'anthropic',
    thinkingBlocks: [],
    content,
    ...(container ? { container } : {}),
  };
}

function readReasoningDetails(value: unknown): {
  thinkingBlocks: AnthropicThinkingBlock[];
  content?: Array<Record<string, unknown>>;
} {
  if (!isRecord(value) || value.provider !== 'anthropic') return { thinkingBlocks: [] };
  const thinkingBlocks = Array.isArray(value.thinkingBlocks)
    ? pickThinkingBlocks(value.thinkingBlocks)
    : [];
  const content = Array.isArray(value.content) ? value.content.filter(isRecord) : undefined;
  return { thinkingBlocks, ...(content ? { content } : {}) };
}

/**
 * One block of a reply as a request carries it: the fields the API reads back,
 * nothing a response adds around them. A thinking block without a signature
 * was cut off and cannot be sent; a block type this client does not know is
 * sent as it came.
 */
function replayBlock(block: Record<string, unknown>): AnthropicAssistantContentBlock | null {
  switch (block.type) {
    case 'thinking':
      if (typeof block.signature !== 'string' || !block.signature) return null;
      return {
        type: 'thinking',
        thinking: typeof block.thinking === 'string' ? block.thinking : '',
        signature: block.signature,
      };
    case 'redacted_thinking':
      return typeof block.data === 'string'
        ? { type: 'redacted_thinking', data: block.data }
        : null;
    case 'text': {
      if (typeof block.text !== 'string') return null;
      const citations = Array.isArray(block.citations) ? block.citations.filter(isRecord) : [];
      return citations.length > 0
        ? { type: 'text', text: block.text, citations }
        : { type: 'text', text: block.text };
    }
    case 'tool_use':
    case 'server_tool_use':
      if (typeof block.id !== 'string' || typeof block.name !== 'string') return null;
      // A call code made (web search's filtering) names that run as its caller.
      return {
        type: block.type,
        id: block.id,
        name: block.name,
        input: isRecord(block.input) ? block.input : {},
        ...(isRecord(block.caller) ? { caller: block.caller } : {}),
      };
    default:
      return block as AnthropicAssistantContentBlock;
  }
}

/**
 * The reply as it arrived. Only the calls the message still carries go back,
 * since each needs a result: a loop that ran some of a round's calls answers
 * only those. A cache marker the message's text carried moves to the last
 * text block.
 */
function replayContent(
  content: Array<Record<string, unknown>>,
  message: Extract<ModelMessage, { role: 'assistant' }>,
): AnthropicAssistantContentBlock[] {
  const callIds = new Set((message.tool_calls ?? []).map((call) => call.id));
  const blocks = content
    .map(replayBlock)
    .filter((block): block is AnthropicAssistantContentBlock => block !== null)
    .filter((block) => block.type !== 'tool_use' || callIds.has(block.id));
  const marker = Array.isArray(message.content)
    ? message.content.find((block) => block.type === 'text' && block.cache_control)
    : undefined;
  if (marker?.type === 'text' && marker.cache_control) {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const block = blocks[i];
      if (block.type !== 'text' || !block.text.trim()) continue;
      blocks[i] = { ...block, cache_control: marker.cache_control };
      break;
    }
  }
  return blocks;
}

function convertAssistantContent(message: Extract<ModelMessage, { role: 'assistant' }>) {
  const details = readReasoningDetails(message.reasoning_details);
  if (details.content) {
    const replayed = replayContent(details.content, message);
    if (replayed.length > 0) return replayed;
  }

  const blocks: AnthropicAssistantContentBlock[] = [];
  blocks.push(...details.thinkingBlocks);

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
