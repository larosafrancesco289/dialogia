import { parseJsonAfter } from '@/lib/tools/json';
import { isRecord } from '@/lib/utils/guards';

export type WebSearchArgs = {
  query: string;
  count?: number;
  freshness?: 'd' | 'w' | 'm' | 'y' | 'all';
  country?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  provider?: 'brave';
};

export type WebSearchToolArgs = WebSearchArgs;

const normalizeDomainList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const filtered = value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
  return filtered.length ? filtered : undefined;
};

const normalizeFreshness = (value: unknown): WebSearchArgs['freshness'] | undefined => {
  return value === 'd' || value === 'w' || value === 'm' || value === 'y' || value === 'all'
    ? value
    : undefined;
};

const normalizeCount = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.min(10, Math.floor(value)));
};

export function normalizeWebSearchArgs(input: Record<string, unknown>): WebSearchArgs {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const count = normalizeCount(input.count);
  const freshness = normalizeFreshness(input.freshness);
  const country = typeof input.country === 'string' ? input.country : undefined;
  const include_domains = normalizeDomainList(input.include_domains);
  const exclude_domains = normalizeDomainList(input.exclude_domains);
  const provider = input.provider === 'brave' ? 'brave' : undefined;

  const result: WebSearchArgs = { query };
  if (count != null) result.count = count;
  if (freshness) result.freshness = freshness;
  if (country) result.country = country;
  if (include_domains) result.include_domains = include_domains;
  if (exclude_domains) result.exclude_domains = exclude_domains;
  if (provider) result.provider = provider;
  return result;
}

export function parseWebSearchArgs(input: unknown): WebSearchArgs | null {
  if (!isRecord(input)) return null;
  const normalized = normalizeWebSearchArgs(input);
  if (!normalized.query) return null;
  return normalized;
}

export function extractWebSearchArgs(text: string): WebSearchArgs | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const candidates: Array<Record<string, unknown>> = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '{') continue;
      const parsed = parseJsonAfter(text, i);
      if (parsed && isRecord(parsed.value)) {
        candidates.push(parsed.value);
        i = parsed.endIndex;
      }
    }
    for (const payload of candidates) {
      const direct = parseWebSearchArgs(payload);
      if (direct) return direct;
      const payloadName = typeof payload.name === 'string' ? payload.name : '';
      if (payloadName === 'web_search') {
        const args = payload.arguments;
        if (typeof args === 'string') {
          try {
            const inner = JSON.parse(args);
            const nested = parseWebSearchArgs(inner);
            if (nested) return nested;
          } catch {
            continue;
          }
        } else if (isRecord(args)) {
          const nested = parseWebSearchArgs(args);
          if (nested) return nested;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}
