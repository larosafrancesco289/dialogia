// Module: anthropic/continuation
// Responsibility: What a Messages API stop_reason means to the app, and how a
// turn the server paused (pause_turn) is resumed. Shared by chat and stream.

import type { FinishReason } from '@/lib/transport/types';
import type {
  AnthropicAssistantMessageContent,
  AnthropicMessagesRequest,
} from '@/lib/anthropic/wire';

/** How many times one turn is resumed after pause_turn before it is taken as it stands. */
export const MAX_PAUSE_TURN_CONTINUATIONS = 5;

/**
 * An unknown or missing stop_reason maps to undefined, not 'stop': a stream cut
 * off before message_delta did not finish cleanly, and saying it did would hide
 * the truncation from the checks that look for it.
 */
export function mapStopReason(value: unknown): FinishReason | undefined {
  if (value === 'tool_use') return 'tool_calls';
  if (
    value === 'max_tokens' ||
    value === 'model_context_window_exceeded' ||
    value === 'pause_turn'
  ) {
    return 'length';
  }
  if (value === 'refusal') return 'content_filter';
  if (value === 'end_turn' || value === 'stop_sequence') return 'stop';
  return undefined;
}

/**
 * The request that resumes a paused turn: the paused response's content sent
 * back as the assistant's message. Returns `body` itself when there is nothing
 * to send, which the callers read as "stop here".
 */
export function appendContinuationMessage(
  body: AnthropicMessagesRequest,
  content: unknown,
): AnthropicMessagesRequest {
  if (!Array.isArray(content) || content.length === 0) return body;
  return {
    ...body,
    messages: [
      ...body.messages,
      { role: 'assistant', content: content as AnthropicAssistantMessageContent },
    ],
  };
}
