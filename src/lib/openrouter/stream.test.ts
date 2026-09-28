import { test } from 'node:test';
import assert from 'node:assert/strict';
import { separateSummaryParts, streamChatCompletion } from '@/lib/openrouter/stream';
import { buildTransportAuth } from '@/lib/auth/transport';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { StreamCallbacks, StreamDoneExtras } from '@/lib/transport/types';
import { mockFetch } from '../../../tests/helpers/mockFetch';

test('a summary part after a finished sentence starts a new paragraph', () => {
  assert.equal(
    separateSummaryParts('.', '**Checking the base rate**'),
    '\n\n**Checking the base rate**',
  );
  assert.equal(separateSummaryParts('!', '**Next**'), '\n\n**Next**');
});

test('bold inside a sentence, or at the very start, is left alone', () => {
  assert.equal(separateSummaryParts(' ', '**key** idea'), '**key** idea');
  assert.equal(separateSummaryParts('', '**Title**'), '**Title**');
  assert.equal(separateSummaryParts('\n', '**Title**'), '**Title**');
  assert.equal(separateSummaryParts('.', ' and more'), ' and more');
});

const sse = (chunks: unknown[]) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const lines = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`);
        controller.enqueue(new TextEncoder().encode(`${lines.join('')}data: [DONE]\n\n`));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );

async function streamChunks(chunks: unknown[], callbacks: StreamCallbacks = {}) {
  const restore = mockFetch(async () => sse(chunks));
  let extras: StreamDoneExtras | undefined;
  try {
    await streamChatCompletion({
      auth: buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'k' }),
      model: 'anthropic/claude-opus',
      messages: [{ role: 'user', content: 'Hello' }],
      callbacks: {
        ...callbacks,
        onDone: (_full, done) => {
          extras = done;
        },
      },
    });
  } finally {
    restore();
  }
  return extras;
}

const delta = (value: Record<string, unknown>) => ({ choices: [{ delta: value }] });

test('reasoning_details streamed in fragments add up to the whole signed blocks', async () => {
  const text = (value: string, index: number) => ({
    type: 'reasoning.text',
    text: value,
    signature: null,
    format: 'anthropic-claude-v1',
    index,
  });
  const extras = await streamChunks([
    delta({ reasoning: 'Let me ', reasoning_details: [text('Let me ', 0)] }),
    delta({ reasoning: 'search.', reasoning_details: [text('search.', 0)] }),
    delta({
      reasoning_details: [
        { type: 'reasoning.text', signature: 'sig-0', format: 'anthropic-claude-v1', index: 0 },
      ],
    }),
    delta({ reasoning: 'Found it.', reasoning_details: [text('Found it.', 1)] }),
    delta({ reasoning_details: [{ type: 'reasoning.encrypted', data: 'opaque', index: 2 }] }),
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ]);
  assert.deepEqual(extras?.reasoningDetails, [
    {
      type: 'reasoning.text',
      text: 'Let me search.',
      signature: 'sig-0',
      format: 'anthropic-claude-v1',
      index: 0,
    },
    {
      type: 'reasoning.text',
      text: 'Found it.',
      signature: null,
      format: 'anthropic-claude-v1',
      index: 1,
    },
    { type: 'reasoning.encrypted', data: 'opaque', index: 2 },
  ]);
});
