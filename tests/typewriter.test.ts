import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTypewriter } from '@/lib/agent/streaming/typewriter';

test('typewriter emits all pushed content', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('Hello');
  tw.push(' World');

  // Wait for typewriter to process
  await new Promise((resolve) => setTimeout(resolve, 300));
  tw.complete();

  const result = emitted.join('');
  assert.equal(result, 'Hello World');
});

test('typewriter complete() flushes remaining buffer', () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('Test content');
  tw.complete();

  const result = emitted.join('');
  assert.equal(result, 'Test content');
});

test('typewriter handles empty push gracefully', () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('');
  tw.push('Hello');
  tw.complete();

  const result = emitted.join('');
  assert.equal(result, 'Hello');
});

test('typewriter bufferSize reflects current buffer', () => {
  const tw = createTypewriter(() => {});

  assert.equal(tw.bufferSize, 0);
  tw.push('Hello');
  assert.ok(tw.bufferSize > 0);
  tw.complete();
  assert.equal(tw.bufferSize, 0);
});
