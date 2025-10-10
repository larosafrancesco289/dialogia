import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from './metrics';

test('computeMetrics derives ttft and throughput', () => {
  const startedAt = 1_000;
  const firstTokenAt = 1_200;
  const finishedAt = 1_600;
  const metrics = computeMetrics({
    startedAt,
    firstTokenAt,
    finishedAt,
    usage: { prompt_tokens: 20, completion_tokens: 40 },
  });
  assert.equal(metrics.ttftMs, 200);
  assert.equal(metrics.completionMs, 600);
  assert.equal(metrics.promptTokens, 20);
  assert.equal(metrics.completionTokens, 40);
  assert.equal(metrics.tokensPerSec, Number((40 / 0.6).toFixed(2)));
});
