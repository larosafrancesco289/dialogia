import { v4 as uuidv4 } from 'uuid';

export type WebSearchRequest = { query: string; count?: number };

export function extractWebSearchArgs(text: string): WebSearchRequest | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const candidates: Array<Record<string, any>> = [];
    const jsonMatches = text.match(/\{[\s\S]*?\}/g) || [];
    for (const match of jsonMatches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed && typeof parsed === 'object') candidates.push(parsed);
      } catch {}
    }
    for (const payload of candidates) {
      const direct = readSearchPayload(payload);
      if (direct) return direct;
      if (typeof payload.name === 'string' && payload.name === 'web_search') {
        const args = payload.arguments;
        if (typeof args === 'string') {
          try {
            const inner = JSON.parse(args);
            const nested = readSearchPayload(inner);
            if (nested) return nested;
          } catch {}
        } else if (args && typeof args === 'object') {
          const nested = readSearchPayload(args);
          if (nested) return nested;
        }
      }
    }
  } catch {}
  return null;
}

function readSearchPayload(value: any): WebSearchRequest | null {
  if (!value || typeof value !== 'object') return null;
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  if (!query) return null;
  const rawCount = value.count;
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(10, Math.floor(rawCount)))
    : undefined;
  return { query, count };
}

export type TutorToolCall = { name: string; args: any };

export function extractTutorToolCalls(text: string): TutorToolCall[] {
  if (typeof text !== 'string' || !text) return [];
  const supported = ['quiz_mcq'];
  const output: TutorToolCall[] = [];
  for (const tool of supported) {
    const idx = text.indexOf(tool);
    if (idx < 0) continue;
    const cursor = Math.max(text.indexOf(':', idx), text.indexOf('(', idx));
    const json = parseJsonAfter(text, cursor >= 0 ? cursor : idx);
    if (json && typeof json === 'object') output.push({ name: tool, args: json });
  }
  return output;
}

function parseJsonAfter(source: string, from: number): any | undefined {
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
            return JSON.parse(raw);
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

export type TutorQuizPayload = {
  items: Array<{ id: string; [key: string]: any }>;
};

export function normalizeTutorQuizPayload(args: any): TutorQuizPayload | null {
  if (!args || typeof args !== 'object') return null;
  const items: any[] = Array.isArray(args.items) ? args.items : [];
  if (items.length === 0) return null;
  const normalized = items.slice(0, 40).map((item) => {
    const raw = (item as any).id;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    const id = !trimmed || trimmed === 'null' || trimmed === 'undefined' ? uuidv4() : trimmed;
    return { ...item, id };
  });
  return { items: normalized };
}
