import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeSse, type SseEvent } from '@/lib/api/stream';

const encoder = new TextEncoder();

function sseResponse(chunks: string[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

async function collect(chunks: string[]) {
  const events: SseEvent[] = [];
  let started = false;
  let doneInfo: { receivedDone: boolean } | undefined;
  await consumeSse(sseResponse(chunks), {
    onStart: () => {
      started = true;
    },
    onMessage: (event) => events.push(event),
    onDone: (info) => {
      doneInfo = info;
    },
  });
  return { events, started, doneInfo };
}

test('consumeSse emits data events and signals completion', async () => {
  const { events, started, doneInfo } = await collect([
    'data: {"step":1}\n\n',
    'data: {"step":2}\n\n',
    'data: [DONE]\n\n',
  ]);

  assert.equal(started, true);
  assert.deepEqual(
    events.map((e) => e.data),
    ['{"step":1}', '{"step":2}'],
  );
  assert.equal(doneInfo?.receivedDone, true);
});

test('consumeSse joins consecutive data lines of one event with newlines', async () => {
  const { events } = await collect(['data: first\ndata: second\ndata: third\n\n']);

  assert.equal(events.length, 1);
  assert.equal(events[0].data, 'first\nsecond\nthird');
});

test('consumeSse keeps the event name attached to the joined payload', async () => {
  const { events } = await collect(['event: ping\ndata: {"a":1}\ndata: {"b":2}\n\n']);

  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'ping');
  assert.equal(events[0].data, '{"a":1}\n{"b":2}');
});

test('consumeSse handles CRLF line endings', async () => {
  const { events, doneInfo } = await collect([
    'event: message\r\ndata: {"a":1}\r\ndata: {"b":2}\r\n\r\n',
    'data: [DONE]\r\n\r\n',
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].data, '{"a":1}\n{"b":2}');
  assert.equal(doneInfo?.receivedDone, true);
});

test('consumeSse buffers payloads split across chunk boundaries', async () => {
  const { events } = await collect(['data: {"ste', 'p":1}\ndata: {"step"', ':2}\n\n']);

  assert.equal(events.length, 1);
  assert.equal(events[0].data, '{"step":1}\n{"step":2}');
});

test('consumeSse flushes a final event that has no terminating blank line', async () => {
  const { events, doneInfo } = await collect(['data: {"step":1}\n\n', 'data: {"step":2}']);

  assert.deepEqual(
    events.map((e) => e.data),
    ['{"step":1}', '{"step":2}'],
  );
  assert.equal(doneInfo?.receivedDone, false);
});

test('consumeSse treats a trailing [DONE] without a blank line as completion', async () => {
  const { events, doneInfo } = await collect(['data: {"step":1}\n\n', 'data: [DONE]']);

  assert.equal(events.length, 1);
  assert.equal(doneInfo?.receivedDone, true);
});

test('consumeSse ignores comments and blank events', async () => {
  const { events } = await collect([': keep-alive\n\n', '\n\n', 'data: {"step":1}\n\n']);

  assert.deepEqual(
    events.map((e) => e.data),
    ['{"step":1}'],
  );
});
