// Module: ui/usageSummary
// Responsibility: Aggregate assistant reply counts, token totals, and estimated
// spend across time windows and models for Settings › Data.

import { computeCost } from '@/lib/cost';
import type { UsageRecord } from '@/lib/db/repository';
import { formatModelLabel } from '@/lib/models';
import type { ModelDescriptor } from '@/lib/types';

export type UsageRange = '7d' | '30d' | 'all';

export type ModelUsageRow = {
  modelId: string;
  label: string;
  replies: number;
  pricedReplies: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  currency: string;
};

export type UsageSummary = {
  replies: number;
  pricedReplies: number;
  unpricedReplies: number;
  tokensIn: number;
  tokensOut: number;
  totalCost: number;
  currency: string;
  byModel: ModelUsageRow[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffFor(range: UsageRange, now: number): number | undefined {
  if (range === '7d') return now - 7 * DAY_MS;
  if (range === '30d') return now - 30 * DAY_MS;
  return undefined;
}

function readTokens(record: UsageRecord): { tokensIn: number; tokensOut: number } {
  const tokensIn =
    record.usage?.prompt_tokens ?? record.usage?.input_tokens ?? record.tokensIn ?? 0;
  const tokensOut =
    record.usage?.completion_tokens ?? record.usage?.output_tokens ?? record.tokensOut ?? 0;
  return {
    tokensIn: Number.isFinite(tokensIn) && tokensIn > 0 ? tokensIn : 0,
    tokensOut: Number.isFinite(tokensOut) && tokensOut > 0 ? tokensOut : 0,
  };
}

export function computeUsageSummary(
  records: UsageRecord[],
  models: ModelDescriptor[],
  range: UsageRange,
  now = Date.now(),
): UsageSummary {
  const cutoff = cutoffFor(range, now);
  const modelById = new Map(models.map((m) => [m.id, m]));
  const buckets = new Map<string, ModelUsageRow>();
  let replies = 0;
  let pricedReplies = 0;
  let unpricedReplies = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let totalCost = 0;
  let currency = 'USD';

  for (const record of records) {
    if (cutoff !== undefined && record.createdAt < cutoff) continue;
    const modelId = record.model || '';
    const model = modelId ? modelById.get(modelId) : undefined;
    const tokens = readTokens(record);
    const { total, currency: recordCurrency } = computeCost({
      model,
      promptTokens: tokens.tokensIn || undefined,
      completionTokens: tokens.tokensOut || undefined,
      usage: record.usage,
    });
    const hasExplicitFreeRates =
      model?.pricing != null &&
      typeof model.pricing.prompt === 'number' &&
      model.pricing.prompt >= 0 &&
      typeof model.pricing.completion === 'number' &&
      model.pricing.completion >= 0;
    const hasPrice = total !== undefined || hasExplicitFreeRates;
    const cost = total && total > 0 ? total : 0;
    const rowCurrency = recordCurrency || 'USD';
    if (cost > 0) currency = rowCurrency;

    replies += 1;
    if (hasPrice) pricedReplies += 1;
    else unpricedReplies += 1;
    tokensIn += tokens.tokensIn;
    tokensOut += tokens.tokensOut;
    totalCost += cost;

    const key = modelId || '__unknown__';
    const existing = buckets.get(key);
    if (existing) {
      existing.replies += 1;
      if (hasPrice) existing.pricedReplies += 1;
      existing.tokensIn += tokens.tokensIn;
      existing.tokensOut += tokens.tokensOut;
      existing.cost += cost;
    } else {
      buckets.set(key, {
        modelId,
        label: modelId ? formatModelLabel({ model, fallbackId: modelId }) : '',
        replies: 1,
        pricedReplies: hasPrice ? 1 : 0,
        tokensIn: tokens.tokensIn,
        tokensOut: tokens.tokensOut,
        cost,
        currency: rowCurrency,
      });
    }
  }

  const byModel = Array.from(buckets.values()).sort(
    (a, b) => b.cost - a.cost || b.replies - a.replies || a.label.localeCompare(b.label),
  );

  return {
    replies,
    pricedReplies,
    unpricedReplies,
    tokensIn,
    tokensOut,
    totalCost,
    currency,
    byModel,
  };
}
