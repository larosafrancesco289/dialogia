import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeSse } from '@/lib/api/stream';

const encoder = new TextEncoder();

test('consumeSse emits data events and signals completion', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"step":1}\n'));
      controller.enqueue(encoder.encode('data: {"step":2}\n'));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  const response = new Response(stream);
  const events: string[] = [];
  let started = false;
  let doneInfo: { receivedDone: boolean } | undefined;

  await consumeSse(response, {
    onStart: () => {
      started = true;
    },
    onMessage: (data) => {
      events.push(data);
    },
    onDone: (info) => {
      doneInfo = info;
    },
  });

  assert.equal(started, true);
  assert.deepEqual(events, ['{"step":1}', '{"step":2}']);
  assert.equal(doneInfo?.receivedDone, true);
});
