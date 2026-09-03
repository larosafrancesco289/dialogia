// Module: agent/streaming/draft
// Responsibility: Judge whether a streamed reply reads as finished. The turn
// uses this twice: to decide whether a tool-capable model that called no tool
// deserves one retry, and to decide whether a draft written before a tool round
// can stand as the final answer instead of being streamed again.

import type { StreamDoneExtras } from '@/lib/transport/types';

/**
 * True when the text looks cut off or empty. The trailing-punctuation rules are
 * deliberate: a tutor reply ending in "before we proceed:" is one that narrated
 * a tool call it never made, and a fresh call usually makes it.
 */
export function looksIncomplete(
  content: string,
  finishReason?: StreamDoneExtras['finishReason'],
): boolean {
  const trimmed = content.trim();
  // A classifier refusal is final, not truncated. Retrying the same prompt
  // would only get blocked again.
  if (finishReason === 'content_filter') return false;
  if (!trimmed) return true;
  if (finishReason === 'length') return true;
  const fences = trimmed.match(/```/g);
  if (fences && fences.length % 2 === 1) return true;
  if (/[([{]$/.test(trimmed)) return true;
  if (/[,:;-]$/.test(trimmed)) return true;
  return false;
}

/**
 * The text to keep when a turn ends without a final stream: the draft already
 * on screen, unless it reads as unfinished and a complete fallback exists.
 */
export function chooseFinalDraft(current: string, fallback: string): string {
  const preferFallback =
    !!fallback && (!current || looksIncomplete(current)) && !looksIncomplete(fallback);
  return preferFallback ? fallback : current || fallback;
}
