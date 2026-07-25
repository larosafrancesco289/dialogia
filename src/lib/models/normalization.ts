import type { ModelDescriptor } from '@/lib/types';
import type { ModelTransport } from '@/lib/transport/models';
import { isRecord } from '@/lib/utils/guards';

type NormalizeModelOptions = {
  transport?: ModelTransport;
  providerDisplay?: string;
};

const parsePricing = (value: unknown): ModelDescriptor['pricing'] | undefined => {
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
  const inputCacheRead = parseRate(value.input_cache_read ?? value.inputCacheRead);
  const inputCacheWrite = parseRate(value.input_cache_write ?? value.inputCacheWrite);
  const image = parseRate(value.image);
  const audio = parseRate(value.audio);
  const webSearch = parseRate(value.web_search ?? value.webSearch);
  const internalReasoning = parseRate(value.internal_reasoning ?? value.internalReasoning);
  const currency = typeof value.currency === 'string' ? value.currency : undefined;
  if (
    prompt == null &&
    completion == null &&
    inputCacheRead == null &&
    inputCacheWrite == null &&
    image == null &&
    audio == null &&
    webSearch == null &&
    internalReasoning == null &&
    currency == null
  )
    return undefined;
  const pricing: ModelDescriptor['pricing'] = {};
  if (prompt != null) pricing.prompt = prompt;
  if (completion != null) pricing.completion = completion;
  if (inputCacheRead != null) pricing.inputCacheRead = inputCacheRead;
  if (inputCacheWrite != null) pricing.inputCacheWrite = inputCacheWrite;
  if (image != null) pricing.image = image;
  if (audio != null) pricing.audio = audio;
  if (webSearch != null) pricing.webSearch = webSearch;
  if (internalReasoning != null) pricing.internalReasoning = internalReasoning;
  if (currency != null) pricing.currency = currency;
  return pricing;
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
