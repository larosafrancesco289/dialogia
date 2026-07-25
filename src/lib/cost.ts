import { ANTHROPIC_ENDPOINT_ID } from '@/lib/transport/endpoints';
import type { ModelDescriptor } from '@/lib/types';
import type { Usage } from '@/lib/api/normalizers';

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
  const hasCacheRates = cacheReadRate != null || cacheWriteRate != null;
  const directAnthropic =
    model?.endpointId === ANTHROPIC_ENDPOINT_ID || model?.id?.startsWith('anthropic-direct/');
  const billablePromptTokens =
    !directAnthropic && hasCacheRates
      ? Math.max(0, (promptTokens ?? 0) - (cacheReadTokens ?? 0) - (cacheWriteTokens ?? 0))
      : promptTokens;

  const pCost =
    promptRate != null && billablePromptTokens != null ? promptRate * billablePromptTokens : 0;
  const cacheReadCost =
    cacheReadRate != null && cacheReadTokens != null ? cacheReadRate * cacheReadTokens : 0;
  const cacheWriteCost =
    cacheWriteRate != null && cacheWriteTokens != null ? cacheWriteRate * cacheWriteTokens : 0;
  const cCost =
    completionRate != null && completionTokens != null ? completionRate * completionTokens : 0;
  const total = pCost + cacheReadCost + cacheWriteCost + cCost;
  return { currency, total: total || undefined };
}

// Format a number like 1.234 to "$1.23"; returns undefined if not finite
function formatUsd(amount?: number): string | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
  return `$${amount.toFixed(2)}`;
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

// Build a compact pricing descriptor for a model, e.g. "in $5/M, out $15/M"
export function describeModelPricing(model?: ModelDescriptor | null): string | undefined {
  if (!model || !model.pricing) return undefined;
  const pIn = perMillion(toNumber(model.pricing?.prompt));
  const pOut = perMillion(toNumber(model.pricing?.completion));

  const parts: string[] = [];
  const inStr = typeof pIn === 'number' ? formatUsd(pIn) : undefined;
  const outStr = typeof pOut === 'number' ? formatUsd(pOut) : undefined;
  if (inStr) parts.push(`in ${inStr}/M`);
  if (outStr) parts.push(`out ${outStr}/M`);

  // Only show when at least one of in/out exists
  if (parts.length === 0) return undefined;
  return parts.join(' · ');
}
