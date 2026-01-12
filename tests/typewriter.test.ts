import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTypewriter } from '@/lib/agent/streaming/typewriter';

test('typewriter emits all pushed content', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('Hello');
  tw.push(' World');

  await tw.complete();

  const result = emitted.join('');
  assert.equal(result, 'Hello World');
});

test('typewriter complete() returns a Promise that resolves when buffer drains', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('Test content');

  const completePromise = tw.complete();
  assert.ok(completePromise instanceof Promise, 'complete() should return a Promise');

  await completePromise;

  const result = emitted.join('');
  assert.equal(result, 'Test content');
  assert.equal(tw.bufferSize, 0, 'buffer should be empty after complete resolves');
});

test('typewriter drains buffer quickly on completion', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  // Push a large chunk
  const content = 'A'.repeat(100);
  tw.push(content);

  const startTime = Date.now();
  await tw.complete();
  const elapsed = Date.now() - startTime;

  const result = emitted.join('');
  assert.equal(result, content);

  // Should drain quickly - 100 chars at ~20/frame at 16ms = ~80ms max
  // Allow some buffer for test timing variance
  assert.ok(elapsed < 200, `Expected quick drain, took ${elapsed}ms`);
});

test('typewriter passes through small buffers immediately', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  // Small content should pass through quickly
  tw.push('Hi');

  // Wait for one frame
  await new Promise((resolve) => setTimeout(resolve, 20));

  // Should have emitted already
  const result = emitted.join('');
  assert.equal(result, 'Hi');
});

test('typewriter flush() emits immediately without waiting', () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('Immediate content');
  tw.flush();

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0], 'Immediate content');
  assert.equal(tw.bufferSize, 0);
});

test('typewriter handles empty push gracefully', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('');
  tw.push('Hello');
  await tw.complete();

  const result = emitted.join('');
  assert.equal(result, 'Hello');
});

test('typewriter bufferSize reflects current buffer', async () => {
  const tw = createTypewriter(() => {});

  assert.equal(tw.bufferSize, 0);
  tw.push('Hello');
  assert.ok(tw.bufferSize > 0);
  await tw.complete();
  assert.equal(tw.bufferSize, 0);
});

test('typewriter complete() resolves immediately if buffer is empty', async () => {
  const tw = createTypewriter(() => {});

  const startTime = Date.now();
  await tw.complete();
  const elapsed = Date.now() - startTime;

  assert.ok(elapsed < 10, `Expected immediate resolution, took ${elapsed}ms`);
});

test('typewriter flush() resolves pending completion promise', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  tw.push('Content to flush');

  const completePromise = tw.complete();
  tw.flush();

  await completePromise;

  const result = emitted.join('');
  assert.equal(result, 'Content to flush');
});

test('typewriter adapts to fast incoming rate', async () => {
  const emitted: string[] = [];
  const tw = createTypewriter((text) => emitted.push(text));

  // Simulate fast model - push tokens quickly
  for (let i = 0; i < 10; i++) {
    tw.push('chunk ');
    await new Promise((resolve) => setTimeout(resolve, 5)); // Very fast
  }

  await tw.complete();

  const result = emitted.join('');
  assert.equal(result, 'chunk '.repeat(10));
});
