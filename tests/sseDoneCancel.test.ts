import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeSse } from '@/lib/api/stream';

test('after [DONE] the response body is cancelled, not left open', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // The server says it is done but keeps the connection open.
      controller.enqueue(new TextEncoder().encode('data: {"a":1}\n\ndata: [DONE]\n\n'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const seen: string[] = [];
  await consumeSse(new Response(body), { onMessage: (event) => seen.push(event.data) });
  assert.deepEqual(seen, ['{"a":1}']);
  assert.equal(cancelled, true);
});
