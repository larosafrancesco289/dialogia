// Module: agent/streaming/draft
// Responsibility: Judge whether a streamed reply reads as finished, so a
// tool-capable model that called no tool and stopped mid-thought gets one retry.

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
