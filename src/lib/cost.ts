import type { ORModel } from '@/lib/types';

export function computeCost(opts: {
  model?: ORModel;
  promptTokens?: number;
  completionTokens?: number;
}): { currency?: string; total?: number } {
  const { model, promptTokens, completionTokens } = opts;
  const currency = model?.pricing?.currency || 'USD';
  const promptRate = model?.pricing?.prompt; // per 1M tokens
  const completionRate = model?.pricing?.completion; // per 1M tokens
  const pCost =
    promptRate != null && promptTokens != null ? (promptRate / 1_000_000) * promptTokens : 0;
  const cCost =
    completionRate != null && completionTokens != null
      ? (completionRate / 1_000_000) * completionTokens
      : 0;
  const total = pCost + cCost;
  return { currency, total: total || undefined };
}

// Format a number like 1.234 to "$1.23"; returns undefined if not finite
function formatUsd(amount?: number): string | undefined {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
  return `$${amount.toFixed(amount >= 100 ? 0 : 2)}`;
}

// Normalize potentially string pricing fields from OpenRouter to numbers (per token)
function toNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') {
    const n = Number(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

// Convert per-token price to per-million for display
function perMillion(perToken?: number): number | undefined {
  if (typeof perToken !== 'number' || !Number.isFinite(perToken)) return undefined;
  return perToken * 1_000_000;
}

// Build a compact pricing descriptor for a model, e.g. "in $5/M, out $15/M"
export function describeModelPricing(model?: ORModel | null): string | undefined {
  if (!model || !model.pricing) return undefined;
  const pIn = perMillion(toNumber((model as any).pricing.prompt));
  const pOut = perMillion(toNumber((model as any).pricing.completion));

  const parts: string[] = [];
  const inStr = typeof pIn === 'number' ? formatUsd(pIn) : undefined;
  const outStr = typeof pOut === 'number' ? formatUsd(pOut) : undefined;
  if (inStr) parts.push(`in ${inStr}`);
  if (outStr) parts.push(`out ${outStr}`);

  // Only show when at least one of in/out exists
  if (parts.length === 0) return undefined;
  // Append unit once to reduce clutter
  return `${parts.join(' · ')}/M`;
}
