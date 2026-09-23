import { computeCost } from '@/lib/cost';
import { formatModelLabel } from '@/lib/models';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';

/**
 * The line of record under a reply, set like a book's colophon: which model
 * wrote it, how quickly, how long, and what it cost. Quiet by default; the
 * message shows it on hover and always on the latest reply.
 */
export function MessageColophon({
  message,
  chat,
  models,
}: {
  message: Message;
  chat: Chat;
  models: ModelDescriptor[];
}) {
  const modelId = message.model || chat.settings.modelId;
  const modelInfo = models.find((model) => model.id === modelId);
  const parts: string[] = [formatModelLabel({ model: modelInfo, fallbackId: modelId })];

  const metrics = message.metrics;
  if (metrics) {
    if (metrics.ttftMs != null) parts.push(`first word in ${formatSeconds(metrics.ttftMs)}`);
    const out = metrics.completionTokens ?? message.tokensOut;
    if (out != null) parts.push(`${out.toLocaleString()} tokens`);
    if (metrics.tokensPerSec != null) parts.push(`${metrics.tokensPerSec} tokens/s`);
    const { currency, total } = computeCost({
      model: modelInfo,
      promptTokens: metrics.promptTokens ?? message.tokensIn,
      completionTokens: out,
      usage: message.usage,
    });
    if (total && total > 0) parts.push(`${currency} ${total.toFixed(4)}`);
  }

  return <p className="message-colophon">{parts.join(' · ')}</p>;
}

function formatSeconds(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
