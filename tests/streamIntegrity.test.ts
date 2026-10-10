import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumeSse } from '@/lib/api/stream';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat } from '@/lib/messages/indexing';
import { streamChatCompletion as streamOpenRouter } from '@/lib/openrouter/stream';
import { streamChatCompletion as streamAnthropic } from '@/lib/anthropic/stream';
import { buildTransportAuth } from '@/lib/auth/transport';
import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { ApiError, API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { NOTICE_CATALOG, cutOffFor, describeErrorNotice } from '@/lib/store/notices';
import type { StreamDoneExtras } from '@/lib/transport/types';
import { createTestStoreState } from './helpers/createTestStoreState';
import { mockFetch } from './helpers/mockFetch';
import { anthropicEvent, faultyResponse, openAiChunk, type Fault } from './helpers/faultyResponse';

const OPENROUTER_AUTH = buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'k' });
const ANTHROPIC_AUTH = buildTransportAuth({ endpoint: ANTHROPIC_ENDPOINT, apiKey: 'k' });

/** A reply streaming into a real store, as a turn's callbacks see it. */
function replyHarness() {
  const assistant = createAssistantMessage({ chatId: 'c1', content: '', createdAt: 1 });
  const { state, set, get } = createTestStoreState();
  Object.assign(state, appendMessagesToChat(state, 'c1', [assistant]));
  const callbacks = createMessageStreamCallbacks(
    { chatId: 'c1', assistantMessage: assistant, set, get, persistMessage: async () => undefined },
    { startedAt: 0 },
  );
  return { reply: () => state.messagesById[assistant.id], callbacks };
}

async function runOpenRouter(chunks: string[], fault: Fault) {
  const { reply, callbacks } = replyHarness();
  let done: StreamDoneExtras | undefined;
  const restore = mockFetch(async () => faultyResponse(chunks, fault));
  let error: unknown;
  try {
    await streamOpenRouter({
      auth: OPENROUTER_AUTH,
      model: 'p/m',
      messages: [{ role: 'user', content: 'x' }],
      callbacks: {
        ...callbacks,
        onDone: async (full, extras) => {
          done = extras;
          await callbacks.onDone?.(full, extras);
        },
      },
    });
  } catch (caught) {
    error = caught;
  } finally {
    restore();
  }
  return { reply: reply(), done, error };
}

const PARTIAL = 'The three causes are: first, the';

test('an OpenAI-style stream that closes without [DONE] or a finish reason is cut off, not finished', async () => {
  const { reply, done, error } = await runOpenRouter(
    [openAiChunk({ choices: [{ delta: { content: PARTIAL } }] })],
    { kind: 'truncate' },
  );

  assert.equal(done, undefined);
  assert.ok(isApiError(error) && error.code === API_ERROR_CODES.STREAM_CUT_OFF);
  assert.equal(reply.content, PARTIAL, 'what arrived is kept');
  assert.equal(reply.cutOff, 'failed');
  assert.equal(reply.cutOffReason, NOTICE_CATALOG.cutOff);
});

test('a finish reason alone ends a stream: some servers never send [DONE]', async () => {
  const { reply, done, error } = await runOpenRouter(
    [
      openAiChunk({ choices: [{ delta: { content: 'All done.' } }] }),
      openAiChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
    ],
    { kind: 'truncate' },
  );

  assert.equal(error, undefined);
  assert.equal(done?.finishReason, 'stop');
  assert.equal(reply.content, 'All done.');
  assert.equal(reply.cutOff, undefined);
});

test('a non-standard finish reason still counts as the provider ending the reply', async () => {
  const { error, reply } = await runOpenRouter(
    [
      openAiChunk({ choices: [{ delta: { content: 'Fine.' } }] }),
      openAiChunk({ choices: [{ delta: {}, finish_reason: 'eos' }] }),
    ],
    { kind: 'truncate' },
  );

  assert.equal(error, undefined);
  assert.equal(reply.cutOff, undefined);
});

test('a tool call cut off mid-arguments is never handed on to run', async () => {
  const { done, error } = await runOpenRouter(
    [
      openAiChunk({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 't1', function: { name: 'web_search', arguments: '{"qu' } },
              ],
            },
          },
        ],
      }),
    ],
    { kind: 'truncate' },
  );

  assert.equal(done, undefined, 'onDone, which carries tool calls to the loop, never fires');
  assert.ok(isApiError(error) && error.code === API_ERROR_CODES.STREAM_CUT_OFF);
});

test('an Anthropic stream that closes before message_stop is cut off', async () => {
  const { reply, callbacks } = replyHarness();
  const restore = mockFetch(async () =>
    faultyResponse(
      [
        anthropicEvent({ type: 'message_start', message: { usage: {} } }),
        anthropicEvent({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        }),
        anthropicEvent({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Step one is to' },
        }),
      ],
      { kind: 'truncate' },
    ),
  );
  try {
    await assert.rejects(
      streamAnthropic({
        auth: ANTHROPIC_AUTH,
        model: 'claude-haiku-5-5',
        messages: [{ role: 'user', content: 'x' }],
        callbacks,
      }),
      (error: unknown) => isApiError(error) && error.code === API_ERROR_CODES.STREAM_CUT_OFF,
    );
  } finally {
    restore();
  }

  assert.equal(reply().content, 'Step one is to');
  assert.equal(reply().cutOff, 'failed');
  assert.equal(reply().cutOffReason, NOTICE_CATALOG.cutOff);
});

test('a network drop mid-stream says the provider could not be reached', async () => {
  for (const wording of ['network error', 'Load failed', 'Failed to fetch']) {
    const { reply } = await runOpenRouter(
      [openAiChunk({ choices: [{ delta: { content: 'Partial' } }] })],
      { kind: 'error', error: new TypeError(wording) },
    );
    assert.equal(reply.cutOff, 'failed', wording);
    assert.equal(reply.cutOffReason, NOTICE_CATALOG.unreachable, wording);
  }
});

test('a stream that goes quiet is given up on after the idle timeout', async () => {
  await assert.rejects(
    consumeSse(
      faultyResponse(['data: {"a":1}\n\n'], { kind: 'stall' }),
      { onMessage: () => undefined },
      { idleTimeoutMs: 30 },
    ),
    (error: unknown) => isApiError(error) && error.code === API_ERROR_CODES.STREAM_STALLED,
  );
  assert.equal(
    describeErrorNotice(new ApiError({ code: API_ERROR_CODES.STREAM_STALLED })),
    NOTICE_CATALOG.stalled,
  );
});

test('keep-alive comments count as activity, so a quiet but live stream is not cut', async () => {
  const seen: string[] = [];
  let receivedDone = false;
  await consumeSse(
    faultyResponse(['data: {"a":1}\n\n'], {
      kind: 'keepAlive',
      everyMs: 15,
      times: 6,
      tail: ['data: {"b":2}\n\n', 'data: [DONE]\n\n'],
    }),
    {
      onMessage: (event) => seen.push(event.data),
      onDone: (info) => {
        receivedDone = info.receivedDone;
      },
    },
    { idleTimeoutMs: 40 },
  );

  assert.deepEqual(seen, ['{"a":1}', '{"b":2}']);
  assert.equal(receivedDone, true);
});

test('a provider error that mentions "aborted" is a failure, not the person pressing Stop', () => {
  const provider = new ApiError({
    code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED,
    message: 'Upstream request aborted by provider',
  });
  assert.equal(cutOffFor(provider).cutOff, 'failed');

  const stop = new Error('The operation was aborted.');
  stop.name = 'AbortError';
  assert.equal(cutOffFor(stop).cutOff, 'stopped');
  const wrappedStop = new ApiError({ code: API_ERROR_CODES.OPENROUTER_CHAT_FAILED, detail: stop });
  assert.equal(cutOffFor(wrappedStop).cutOff, 'stopped');
});
