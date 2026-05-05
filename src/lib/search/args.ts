import { parseJsonAfter } from '@/lib/tools/json';
import { isRecord } from '@/lib/utils/guards';

export type WebSearchArgs = {
  query: string;
  count?: number;
  freshness?: 'd' | 'w' | 'm' | 'y' | 'all';
  country?: string;
  include_domains?: string[];
  exclude_domains?: string[];
  provider?: 'tavily';
};

export type WebSearchToolArgs = WebSearchArgs;

export type WebFetchArgs = {
  url: string;
  extract_depth?: 'basic' | 'advanced';
  format?: 'markdown' | 'text';
  include_images?: boolean;
  include_favicon?: boolean;
  query?: string;
  chunks_per_source?: number;
  provider?: 'tavily';
};

export type WebFetchToolArgs = WebFetchArgs;

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

const normalizeChunksPerSource = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.min(5, Math.floor(value)));
};

const normalizeBoolean = (value: unknown): boolean | undefined => {
  return typeof value === 'boolean' ? value : undefined;
};

export function normalizeWebSearchArgs(input: Record<string, unknown>): WebSearchArgs {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  const count = normalizeCount(input.count);
  const freshness = normalizeFreshness(input.freshness);
  const country = typeof input.country === 'string' ? input.country : undefined;
  const include_domains = normalizeDomainList(input.include_domains);
  const exclude_domains = normalizeDomainList(input.exclude_domains);
  const provider = input.provider === 'tavily' || input.provider === 'brave' ? 'tavily' : undefined;

  const result: WebSearchArgs = { query };
  if (count != null) result.count = count;
  if (freshness) result.freshness = freshness;
  if (country) result.country = country;
  if (include_domains) result.include_domains = include_domains;
  if (exclude_domains) result.exclude_domains = exclude_domains;
  if (provider) result.provider = provider;
  return result;
}

export function normalizeWebFetchArgs(input: Record<string, unknown>): WebFetchArgs {
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const extract_depth =
    input.extract_depth === 'advanced' || input.extract_depth === 'basic'
      ? input.extract_depth
      : undefined;
  const format = input.format === 'text' || input.format === 'markdown' ? input.format : undefined;
  const include_images = normalizeBoolean(input.include_images);
  const include_favicon = normalizeBoolean(input.include_favicon);
  const query = typeof input.query === 'string' ? input.query.trim() : undefined;
  const chunks_per_source = normalizeChunksPerSource(input.chunks_per_source);
  const provider = input.provider === 'tavily' ? 'tavily' : undefined;

  const result: WebFetchArgs = { url };
  if (extract_depth) result.extract_depth = extract_depth;
  if (format) result.format = format;
  if (include_images != null) result.include_images = include_images;
  if (include_favicon != null) result.include_favicon = include_favicon;
  if (query) result.query = query;
  if (chunks_per_source != null) result.chunks_per_source = chunks_per_source;
  if (provider) result.provider = provider;
  return result;
}

export function parseWebSearchArgs(input: unknown): WebSearchArgs | null {
  if (!isRecord(input)) return null;
  const normalized = normalizeWebSearchArgs(input);
  if (!normalized.query) return null;
  return normalized;
}

export function parseWebFetchArgs(input: unknown): WebFetchArgs | null {
  if (!isRecord(input)) return null;
  const normalized = normalizeWebFetchArgs(input);
  if (!normalized.url) return null;
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
