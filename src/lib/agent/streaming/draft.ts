// Module: agent/streaming/draft
// Responsibility: Judge whether a streamed reply reads as finished: a
// tool-capable model that called no tool and stopped mid-thought gets one
// retry, and a kept answer that does not read as whole is not ended by a Stop.

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

// A list item, heading, quote, table row or indented code: lines that end on a
// word by design.
const NOT_PROSE_RE = /^(?: {4}|\t|\s*(?:[-*+>#|]|\d+[.)](?:\s|$)))|\|/;

/**
 * A last paragraph of one line of prose, several words long, that stops on a
 * plain word: the sentence was never finished. Kept narrow, since a false
 * positive keeps a Stop from ending the reply: a short answer ("Paris"), verse (lines inside one
 * paragraph), and a line ending in a link, a version, a mark or a symbol all
 * read as whole.
 */
export function endsMidSentence(text: string): boolean {
  const lines = text.trim().split('\n');
  const last = lines[lines.length - 1] ?? '';
  if (lines.length > 1 && lines[lines.length - 2]?.trim()) return false;
  if (NOT_PROSE_RE.test(last)) return false;
  const words = last.trim().split(/\s+/);
  if (words.length < 4) return false;
  return /^[\p{L}\p{N}'’-]*[\p{L}\p{N}]$/u.test(words[words.length - 1] ?? '');
}
