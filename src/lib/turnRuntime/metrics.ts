// Module: turnRuntime/metrics
// Responsibility: Shared helpers for deriving timing and token metrics from OpenRouter responses.

import type { Usage } from '@/lib/api/normalizers';
import type { MessageMetrics } from '@/lib/types';

export type ComputeMetricsArgs = {
  startedAt: number;
  firstTokenAt?: number;
  finishedAt?: number;
  usage?: Usage;
};

export type TurnMetrics = MessageMetrics;

export function computeMetrics(args: ComputeMetricsArgs): TurnMetrics {
  const { startedAt, firstTokenAt, finishedAt, usage } = args;
  const end = typeof finishedAt === 'number' ? finishedAt : performance.now();
  const ttftMs =
    typeof firstTokenAt === 'number'
      ? Math.max(0, Math.round(firstTokenAt - startedAt))
      : undefined;
  const completionMs = Math.max(0, Math.round(end - startedAt));
  const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens;
  const completionTokens = usage?.completion_tokens ?? usage?.output_tokens;
  const tokensPerSec =
    completionTokens && completionMs
      ? Number((completionTokens / (completionMs / 1000)).toFixed(2))
      : undefined;
  return { ttftMs, completionMs, promptTokens, completionTokens, tokensPerSec };
}

export function formatMetricsForDisplay(metrics?: TurnMetrics): string[] {
  if (!metrics) return [];
  const labels: string[] = [];
  if (metrics.ttftMs != null) labels.push(`TTFT ${metrics.ttftMs} ms`);
  if (metrics.promptTokens != null) labels.push(`in ${metrics.promptTokens}`);
  if (metrics.completionTokens != null) labels.push(`out ${metrics.completionTokens}`);
  if (metrics.tokensPerSec != null) labels.push(`${metrics.tokensPerSec} tok/s`);
  return labels;
}
