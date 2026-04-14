import type { ModelDescriptor } from '@/lib/types';
import type { ModelTransport } from '@/lib/transport/models';
import { isRecord } from '@/lib/utils/guards';

type NormalizeModelOptions = {
  transport?: ModelTransport;
  providerDisplay?: string;
};

const parsePricing = (
  value: unknown,
): { prompt?: number; completion?: number; currency?: string } | undefined => {
  if (!isRecord(value)) return undefined;
  const parseRate = (rate: unknown): number | undefined => {
    if (typeof rate === 'number' && Number.isFinite(rate)) return rate;
    if (typeof rate !== 'string') return undefined;
    const trimmed = rate.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const prompt = parseRate(value.prompt);
  const completion = parseRate(value.completion);
  const currency = typeof value.currency === 'string' ? value.currency : undefined;
  if (prompt == null && completion == null && currency == null) return undefined;
  return { prompt, completion, currency };
};

export function normalizeModelDescriptor(
  entry: unknown,
  opts: NormalizeModelOptions = {},
): ModelDescriptor | null {
  if (!isRecord(entry)) return null;
  const id = typeof entry.id === 'string' ? entry.id : '';
  if (!id) return null;
  const name = typeof entry.name === 'string' ? entry.name : undefined;
  const context_length =
    typeof entry.context_length === 'number' ? entry.context_length : undefined;
  return {
    id,
    name,
    context_length,
    pricing: parsePricing(entry.pricing),
    raw: entry,
    transport: opts.transport,
    transportModelId: id,
    providerDisplay: opts.providerDisplay,
  };
}

export function normalizeModelList(
  payload: unknown,
  opts: NormalizeModelOptions = {},
): ModelDescriptor[] {
  const items = isRecord(payload)
    ? Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : Array.isArray(payload)
          ? payload
          : []
    : Array.isArray(payload)
      ? payload
      : [];

  return items
    .map((entry) => normalizeModelDescriptor(entry, opts))
    .filter((model): model is ModelDescriptor => model !== null);
}

export function normalizeParallelModels(
  baseModelId: string | undefined,
  list?: string[],
): string[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (baseModelId && trimmed === baseModelId) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
