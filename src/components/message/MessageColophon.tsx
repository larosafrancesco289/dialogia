import { computeCost } from '@/lib/cost';
import { formatModelLabel } from '@/lib/models';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { t, useT } from '@/lib/i18n';
import { formatNumber } from '@/lib/i18n/format';

/**
 * The line of record under a reply, set like a book's colophon: which model
 * wrote it, how quickly, how long, and what it cost. Quiet by default; the
 * message shows it on hover and always on the latest reply.
 */
export function MessageColophon({
  message,
  chat,
  models,
  stats = true,
}: {
  message: Message;
  chat: Chat;
  models: ModelDescriptor[];
  /** False: the model's name alone, for a reply another model wrote. */
  stats?: boolean;
}) {
  const t = useT();
  const modelId = message.model || chat.settings.modelId;
  const modelInfo = models.find((model) => model.id === modelId);
  const parts: string[] = [formatModelLabel({ model: modelInfo, fallbackId: modelId })];

  const metrics = message.metrics;
  if (metrics && stats) {
    if (metrics.ttftMs != null) {
      parts.push(t('colophon.firstWord', { time: formatSeconds(metrics.ttftMs) }));
    }
    const out = metrics.completionTokens ?? message.tokensOut;
    if (out != null) parts.push(t('colophon.tokens', { count: out }));
    if (metrics.tokensPerSec != null) {
      parts.push(t('colophon.speed', { rate: metrics.tokensPerSec }));
    }
    const { currency, total } = computeCost({
      model: modelInfo,
      promptTokens: metrics.promptTokens ?? message.tokensIn,
      completionTokens: out,
      usage: message.usage,
    });
    if (total && total > 0) parts.push(formatCost(total, currency ?? 'USD'));
  }

  return <p className="message-colophon">{parts.join(' · ')}</p>;
}

/** "$0.0021", "$0.34", or "under $0.0001" for a reply too cheap to show. */
export function formatCost(total: number, currency: string): string {
  const money = (value: number, digits: number) =>
    formatNumber(value, {
      style: 'currency',
      currency: currency.toUpperCase(),
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  if (total < 0.0001) return t('colophon.under', { amount: money(0.0001, 4) });
  return money(total, total < 0.01 ? 4 : 2);
}

function formatSeconds(ms: number) {
  const narrow = { style: 'unit', unitDisplay: 'short' } as const;
  return ms < 1000
    ? formatNumber(ms, { ...narrow, unit: 'millisecond' })
    : formatNumber(ms / 1000, {
        ...narrow,
        unit: 'second',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
}
