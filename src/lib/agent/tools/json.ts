import { TUTOR_TOOL_NAMES } from '@/lib/agent/types';
import type { TutorToolCall } from '@/lib/agent/types';

export function parseJsonAfter(
  source: string,
  from: number,
): { value: unknown; endIndex: number } | undefined {
  const start = source.indexOf('{', from);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const raw = source.slice(start, i + 1);
          try {
            return { value: JSON.parse(raw), endIndex: i };
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

export function extractTutorToolCalls(text: string): TutorToolCall[] {
  if (typeof text !== 'string' || !text) return [];
  const INLINE_TUTOR_TOOL_NAMES = [...TUTOR_TOOL_NAMES] as TutorToolCall['name'][];
  const output: TutorToolCall[] = [];
  for (const tool of INLINE_TUTOR_TOOL_NAMES) {
    const idx = text.indexOf(tool);
    if (idx < 0) continue;
    const cursor = Math.max(text.indexOf(':', idx), text.indexOf('(', idx));
    const parsed = parseJsonAfter(text, cursor >= 0 ? cursor : idx);
    const json = parsed?.value;
    if (json && typeof json === 'object') {
      output.push({ name: tool, args: json as Record<string, unknown> });
    }
  }
  return output;
}
