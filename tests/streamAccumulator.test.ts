import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamAccumulator } from '@/lib/agent/streaming/accumulator';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('stream accumulator batches nearby deltas into one flush', async () => {
  const emitted: string[] = [];
  const accumulator = createStreamAccumulator((text) => emitted.push(text), {
    flushIntervalMs: 10,
  });

  accumulator.push('Hello');
  accumulator.push(' world');

  assert.deepEqual(emitted, []);
  await wait(25);

  assert.deepEqual(emitted, ['Hello world']);
  assert.equal(accumulator.bufferSize, 0);
});

test('stream accumulator flushes immediately on newline', () => {
  const emitted: string[] = [];
  const accumulator = createStreamAccumulator((text) => emitted.push(text), {
    flushIntervalMs: 100,
  });

  accumulator.push('First line\n');

  assert.deepEqual(emitted, ['First line\n']);
  assert.equal(accumulator.bufferSize, 0);
});

test('stream accumulator flushes large buffered text immediately', () => {
  const emitted: string[] = [];
  const accumulator = createStreamAccumulator((text) => emitted.push(text), {
    flushIntervalMs: 100,
    maxBufferedChars: 8,
  });

  accumulator.push('1234');
  accumulator.push('5678');

  assert.deepEqual(emitted, ['12345678']);
});

test('stream accumulator flush emits pending content without waiting', () => {
  const emitted: string[] = [];
  const accumulator = createStreamAccumulator((text) => emitted.push(text), {
    flushIntervalMs: 100,
  });

  accumulator.push('pending');
  accumulator.flush();

  assert.deepEqual(emitted, ['pending']);
  assert.equal(accumulator.bufferSize, 0);
});

test('stream accumulator cancel drops pending content', async () => {
  const emitted: string[] = [];
  const accumulator = createStreamAccumulator((text) => emitted.push(text), {
    flushIntervalMs: 10,
  });

  accumulator.push('pending');
  accumulator.cancel();
  await wait(25);

  assert.deepEqual(emitted, []);
  assert.equal(accumulator.bufferSize, 0);
});
