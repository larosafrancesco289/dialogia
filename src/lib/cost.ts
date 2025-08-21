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
