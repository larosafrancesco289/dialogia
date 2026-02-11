// Module: agent/cache
// Responsibility: Inject cache_control breakpoints and build multipart system messages
// for OpenRouter / Anthropic prompt caching.
// Cached prefix tokens are billed at 0.1x input price on reads (1.25x on first write).

import type {
  ModelMessage,
  ModelContentBlock,
  CacheControl,
  SystemModelMessage,
} from '@/lib/transport/contracts';

const EPHEMERAL: CacheControl = { type: 'ephemeral' };

/**
 * Convert a message's string content to a content block array.
 * If already an array, returns a shallow copy.
 */
function toContentBlocks(content: string | ModelContentBlock[] | null): ModelContentBlock[] {
  if (content == null) return [{ type: 'text', text: '' }];
  if (Array.isArray(content)) return content.map((b) => ({ ...b }));
  return [{ type: 'text', text: content }];
}

/**
 * Return a copy of `blocks` with `cache_control` set on the last text block.
 */
function markLastTextBlock(blocks: ModelContentBlock[]): ModelContentBlock[] {
  const result = blocks.map((b) => ({ ...b }));
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].type === 'text') {
      result[i] = { ...result[i], cache_control: EPHEMERAL } as ModelContentBlock;
      break;
    }
  }
  return result;
}

/**
 * Build a system message with multipart content blocks when a stable/dynamic split
 * is available. The stable portion gets `cache_control: { type: 'ephemeral' }` so it
 * is cached across turns, while the dynamic portion (e.g. mastery scores) is uncached.
 *
 * When `combinedSystem` is provided alongside `systemStable`, the dynamic portion is
 * derived by stripping the stable prefix from the combined string. This handles cases
 * where the dynamic portion has been augmented (e.g. with search sources).
 */
export function buildSystemMessage(opts: {
  combinedSystem?: string;
  systemStable?: string;
  systemDynamic?: string;
}): ModelMessage | undefined {
  const { combinedSystem, systemStable, systemDynamic } = opts;

  if (systemStable) {
    const blocks: ModelContentBlock[] = [
      { type: 'text', text: systemStable, cache_control: EPHEMERAL },
    ];
    // Derive dynamic portion: prefer extracting from combinedSystem (may include sources),
    // fall back to the compose-time systemDynamic.
    let dynamicText = systemDynamic;
    if (combinedSystem && combinedSystem.startsWith(systemStable)) {
      const remainder = combinedSystem.slice(systemStable.length).replace(/^\n\n/, '');
      if (remainder) dynamicText = remainder;
    }
    if (dynamicText) {
      blocks.push({ type: 'text', text: dynamicText });
    }
    return { role: 'system', content: blocks };
  }

  if (combinedSystem != null) {
    return { role: 'system', content: combinedSystem };
  }

  return undefined;
}

/**
 * Inject `cache_control` breakpoints into a finalized ModelMessage array.
 *
 * Two breakpoints:
 * 1. **System message** -- marks the last text block of the system message so the
 *    stable system prefix is cached across turns.
 * 2. **Conversation prefix** -- marks the last user or assistant message before the
 *    final user message, so the growing conversation history is cached between
 *    consecutive turns.
 *
 * Returns a shallow copy of the array with modified messages; originals are not mutated.
 */
export function applyCacheBreakpoints(messages: ModelMessage[]): ModelMessage[] {
  const result: ModelMessage[] = messages.map((m) => ({ ...m }));

  // 1. System message breakpoint -- skip if already multipart (set up by buildSystemMessage)
  for (let i = 0; i < result.length; i++) {
    if (result[i].role === 'system') {
      const sys = result[i] as SystemModelMessage;
      if (!Array.isArray(sys.content)) {
        result[i] = { role: 'system', content: markLastTextBlock(toContentBlocks(sys.content)) };
      }
      break;
    }
  }

  // 2. Conversation prefix breakpoint -- last user/assistant before the final user message
  let lastUserIdx = -1;
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx > 0) {
    for (let i = lastUserIdx - 1; i >= 0; i--) {
      const msg = result[i];
      if (msg.role !== 'user' && msg.role !== 'assistant') continue;
      const blocks = markLastTextBlock(toContentBlocks(msg.content));
      result[i] = { ...msg, content: blocks } as ModelMessage;
      break;
    }
  }

  return result;
}
