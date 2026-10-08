import { ANTHROPIC_ENDPOINT_ID } from '@/lib/transport/endpoints';
import type { ModelDescriptor } from '@/lib/types';
import type { Usage } from '@/lib/api/normalizers';
import { t } from '@/lib/i18n';
import { formatNumber } from '@/lib/i18n/format';

function usageNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function detailNumber(details: Record<string, unknown> | undefined, ...keys: string[]) {
  if (!details) return undefined;
  for (const key of keys) {
    const value = usageNumber(details[key]);
    if (value != null) return value;
  }
  return undefined;
}

function getCacheReadTokens(usage?: Usage): number | undefined {
  return (
    usageNumber(usage?.cache_read_input_tokens) ??
    detailNumber(usage?.prompt_tokens_details, 'cache_read_tokens', 'cached_tokens')
  );
}

function getCacheWriteTokens(usage?: Usage): number | undefined {
  return (
    usageNumber(usage?.cache_creation_input_tokens) ??
    detailNumber(usage?.prompt_tokens_details, 'cache_write_tokens')
  );
}

export function computeCost(opts: {
  model?: ModelDescriptor;
  promptTokens?: number;
  completionTokens?: number;
  usage?: Usage;
}): { currency?: string; total?: number } {
  const { model, usage } = opts;
  const currency = model?.pricing?.currency || 'USD';
  const reportedCost = usageNumber(usage?.cost);
  if (reportedCost != null) return { currency, total: reportedCost };

  const promptTokens =
    usageNumber(usage?.prompt_tokens) ?? usageNumber(usage?.input_tokens) ?? opts.promptTokens;
  const completionTokens =
    usageNumber(usage?.completion_tokens) ??
    usageNumber(usage?.output_tokens) ??
    opts.completionTokens;
  const cacheReadTokens = getCacheReadTokens(usage);
  const cacheWriteTokens = getCacheWriteTokens(usage);
  const promptRate = model?.pricing?.prompt; // per token
  const completionRate = model?.pricing?.completion; // per token
  const cacheReadRate = model?.pricing?.inputCacheRead;
  const cacheWriteRate = model?.pricing?.inputCacheWrite;
  // A router prices each request by the model it picks and lists -1 for its
  // own rates: the cost is unknown, not negative.
  if ([promptRate, completionRate, cacheReadRate, cacheWriteRate].some((r) => r != null && r < 0)) {
    return { currency };
  }
  const hasCacheRates = cacheReadRate != null || cacheWriteRate != null;
  const directAnthropic =
    model?.endpointId === ANTHROPIC_ENDPOINT_ID || model?.id?.startsWith('anthropic-direct/');
  const billablePromptTokens =
    !directAnthropic && hasCacheRates
      ? Math.max(0, (promptTokens ?? 0) - (cacheReadTokens ?? 0) - (cacheWriteTokens ?? 0))
      : promptTokens;

  // A long prompt bills the whole request at a higher rate, input and output,
  // judged on the whole prompt, cached or not; the Claude API counts cache
  // tokens apart from input_tokens.
  const longPrompt = model?.pricing?.longPrompt;
  const wholePrompt =
    (promptTokens ?? 0) + (directAnthropic ? (cacheReadTokens ?? 0) + (cacheWriteTokens ?? 0) : 0);
  const scale = longPrompt && wholePrompt > longPrompt.above ? longPrompt.multiplier : 1;

  const pCost =
    promptRate != null && billablePromptTokens != null
      ? promptRate * billablePromptTokens * scale
      : 0;
  const cacheReadCost =
    cacheReadRate != null && cacheReadTokens != null ? cacheReadRate * cacheReadTokens * scale : 0;
  const cacheWriteCost =
    cacheWriteRate != null && cacheWriteTokens != null
      ? cacheWriteRate * cacheWriteTokens * scale
      : 0;
  const cCost =
    completionRate != null && completionTokens != null
      ? completionRate * completionTokens * scale
      : 0;
  const total = pCost + cacheReadCost + cacheWriteCost + cCost;
  return { currency, total: total || undefined };
}

// A per-million rate as dollars: cents above a cent, and two significant
// digits below it, where cents would round a real price down to $0.00.
function formatRate(amount: number): string {
  const usd = { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' } as const;
  if (amount >= 0.01) return formatNumber(amount, { ...usd, minimumFractionDigits: 2 });
  const digits = Math.min(10, 1 - Math.floor(Math.log10(amount)));
  return formatNumber(amount, { ...usd, minimumFractionDigits: 0, maximumFractionDigits: digits });
}

// Normalize potentially string pricing fields from OpenRouter to numbers (per token)
function toNumber(val: unknown): number | undefined {
  return usageNumber(val);
}

// Convert per-token price to per-million for display
function perMillion(perToken?: number): number | undefined {
  if (typeof perToken !== 'number' || !Number.isFinite(perToken)) return undefined;
  return perToken * 1_000_000;
}

// Build a compact pricing descriptor for a model, e.g. "in $5/M, out $15/M".
// A negative rate is OpenRouter's "it depends" (a router picks the model), so
// that side says nothing rather than a nonsense price.
export function describeModelPricing(model?: ModelDescriptor | null): string | undefined {
  if (!model || !model.pricing) return undefined;
  const rates: Array<[side: string, rate: number | undefined]> = [
    ['in', perMillion(toNumber(model.pricing?.prompt))],
    ['out', perMillion(toNumber(model.pricing?.completion))],
  ];
  const known = rates.filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] >= 0,
  );
  if (known.length === 0) return undefined;
  if (known.every(([, rate]) => rate === 0)) return t('pricing.free');
  return known
    .map(([side, rate]) =>
      rate === 0
        ? t(side === 'in' ? 'pricing.inFree' : 'pricing.outFree')
        : t(side === 'in' ? 'pricing.in' : 'pricing.out', { rate: formatRate(rate) }),
    )
    .join(' · ');
}
