import { mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { createMessageStreamCallbacks } from '@/lib/agent/streamHandlers';
import type { Message } from '@/lib/types';
import { API_ERROR_CODES } from '@/lib/api/errors';
import { buildAnthropicError } from '@/lib/anthropic/errors';
import { NOTICE_INVALID_KEY, NOTICE_RATE_LIMITED } from '@/lib/store/notices';

function harness(extra: Record<string, unknown> = {}) {
  const notices: unknown[] = [];
  const assistant = {
    id: 'a1',
    chatId: 'c1',
    role: 'assistant',
    content: '',
    createdAt: 1,
  } as Message;
  let state: Record<string, unknown> = {
    messagesById: { a1: assistant },
    messageIdsByChatId: { c1: ['a1'] },
    ui: {},
    chats: [{ id: 'c1', settings: {} }],
    setNotice: (notice?: string) => notices.push(notice),
    ...extra,
  };
  const persisted: Message[] = [];
  const set = (update: unknown) => {
    const partial = typeof update === 'function' ? update(state) : update;
    state = { ...state, ...(partial as object) };
  };
  const get = () => state;
  const callbacks = createMessageStreamCallbacks(
    {
      chatId: 'c1',
      assistantMessage: assistant,
      set: set as never,
      get: get as never,
      persistMessage: async (message) => {
        persisted.push(message);
      },
    },
    { startedAt: 0 },
  );
  const stored = () => (state.messagesById as Record<string, Message>).a1;
  return { callbacks, persisted, stored, notices };
}

test('a reply the person stops is marked stopped, in the store and on disk', () => {
  const { callbacks, persisted, stored } = harness();
  callbacks.onToken?.('Half an answer');
  callbacks.onError?.(new DOMException('The user aborted a request.', 'AbortError'));
  assert.equal(stored()?.cutOff, 'stopped');
  assert.equal(persisted.at(-1)?.cutOff, 'stopped');
});

test('a reply a failure ends is marked failed', () => {
  const { callbacks, persisted } = harness();
  callbacks.onToken?.('Half an answer');
  callbacks.onError?.(new Error('Network error'));
  assert.equal(persisted.at(-1)?.cutOff, 'failed');
});

test('a finished reply carries no cut-off mark', async () => {
  const { callbacks, persisted } = harness();
  callbacks.onToken?.('A whole answer.');
  await callbacks.onDone?.('A whole answer.', { finishReason: 'stop' });
  assert.equal(persisted.at(-1)?.cutOff, undefined);
  assert.equal(persisted.at(-1)?.finishReason, 'stop');
});

test('a finished reply is stored without the tool JSON a model echoed ahead of it', async () => {
  const { callbacks, persisted, stored } = harness();
  const full = '{"tool":"call","args":{"q":"x"}}\nThe answer.';
  callbacks.onToken?.(full);
  await callbacks.onDone?.(full, { finishReason: 'stop' });
  assert.equal(stored()?.content, 'The answer.');
  assert.equal(persisted.at(-1)?.content, 'The answer.');
});

test("a later stream's citations join the reply's, not replace them", () => {
  const { callbacks, stored } = harness();
  const cite = (url: string) => ({ type: 'url_citation', url_citation: { url } });
  callbacks.onAnnotations?.([cite('https://a.test')]);
  callbacks.beginRound();
  callbacks.onAnnotations?.([cite('https://b.test')]);
  assert.deepEqual(stored()?.annotations, [cite('https://a.test'), cite('https://b.test')]);
  // Each stream reports its own whole set, which may repeat what came before.
  callbacks.onAnnotations?.([cite('https://b.test'), cite('https://a.test')]);
  assert.deepEqual(stored()?.annotations, [cite('https://a.test'), cite('https://b.test')]);
});

test('a key refused mid-stream shows the same notice as one refused up front', async () => {
  const refused = (status: number, code: string) =>
    buildAnthropicError(
      new Response(JSON.stringify({ error: { message: 'invalid x-api-key' } }), { status }),
      code,
      status === 401 ? 'Invalid API key' : 'Rate limited',
    );
  const unauthorized = harness();
  unauthorized.callbacks.onError?.(await refused(401, API_ERROR_CODES.UNAUTHORIZED));
  assert.deepEqual(unauthorized.notices, [NOTICE_INVALID_KEY]);
  const limited = harness();
  limited.callbacks.onError?.(await refused(429, API_ERROR_CODES.RATE_LIMITED));
  assert.deepEqual(limited.notices, [NOTICE_RATE_LIMITED]);
});

test('a failure in the open chat is said in the reply, not again in a toast', async () => {
  const open = harness({ selectedChatId: 'c1' });
  open.callbacks.onError?.(new Error('Network error'));
  assert.deepEqual(open.notices, []);
  assert.ok(open.stored()?.cutOffReason);
});

test('thinking is timed from the request, so a model that thinks silently first shows it', async () => {
  const realNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  try {
    const { callbacks, stored } = harness();
    // Three silent seconds before the first thought is streamed, one more after it.
    now = 4_000;
    callbacks.onReasoningToken?.('Weighing it up.');
    now = 5_000;
    callbacks.onToken?.('The answer.');
    await callbacks.onDone?.('The answer.', { finishReason: 'stop' });
    const thought = stored()?.activity?.find((item) => item.type === 'reasoning');
    assert.equal(thought?.type === 'reasoning' ? thought.duration : undefined, 4_000);
  } finally {
    Date.now = realNow;
  }
});

test('thinking settles at the first word even when animation frames stall', async () => {
  const realNow = Date.now;
  const realFrame = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;
  let now = 1_000;
  Date.now = () => now;
  // A frame that never comes: a background tab, or a busy main thread.
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => undefined;
  try {
    const { callbacks, stored } = harness();
    callbacks.onReasoningToken?.('Half a second of thought');
    await new Promise((resolve) => setTimeout(resolve, 40));
    now = 1_500;
    callbacks.onToken?.('The answer.\n');
    now = 35_000;
    await callbacks.onDone?.('The answer.', { finishReason: 'stop' });
    const thought = stored()?.activity?.find((item) => item.type === 'reasoning');
    assert.equal(thought?.type === 'reasoning' ? thought.duration : undefined, 500);
    assert.equal(stored()?.reasoning, 'Half a second of thought');
  } finally {
    Date.now = realNow;
    globalThis.requestAnimationFrame = realFrame;
    globalThis.cancelAnimationFrame = realCancel;
  }
});

/** A page whose hiding and closing the test controls. */
function withPage(run: (page: { hide: () => void; close: () => void }) => Promise<void> | void) {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  g.window = win;
  g.document = doc;
  const page = {
    hide: () => {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    close: () => win.dispatchEvent(new Event('pagehide')),
  };
  return Promise.resolve(run(page)).finally(() => {
    g.window = saved.window;
    g.document = saved.document;
  });
}

test('a page closing mid-reply saves the text on screen at once, marked as cut off', () =>
  withPage(({ close }) => {
    const { callbacks, persisted } = harness();
    // Still waiting for its 32 ms flush, and well inside the first checkpoint's wait.
    callbacks.onToken?.('The first words');
    close();
    assert.equal(persisted.at(-1)?.content, 'The first words');
    assert.equal(persisted.at(-1)?.cutOff, 'interrupted');
  }));

test('a page put away mid-reply saves it too; one coming back into view does not', () =>
  withPage(({ hide }) => {
    const { callbacks, persisted } = harness();
    callbacks.onToken?.('Half');
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(persisted.length, 0);
    hide();
    assert.equal(persisted.at(-1)?.content, 'Half');
  }));

test('a finished or failed reply is not saved again as cut off when the page closes', () =>
  withPage(async ({ close }) => {
    const done = harness();
    done.callbacks.onToken?.('A whole answer.');
    await done.callbacks.onDone?.('A whole answer.', { finishReason: 'stop' });
    const failed = harness();
    failed.callbacks.onError?.(new Error('Network error'));
    const counts = [done.persisted.length, failed.persisted.length];
    close();
    assert.deepEqual([done.persisted.length, failed.persisted.length], counts);
    // Marked before its stream began (the executor's job): left as it is.
    const refused = harness();
    (refused.stored() as Message).cutOff = 'failed';
    close();
    assert.equal(refused.persisted.length, 0);
  }));

test('a reply under way is saved within a second of its words arriving', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { callbacks, persisted } = harness();
    callbacks.onToken?.('Words on screen');
    mock.timers.tick(32);
    assert.equal(persisted.length, 0);
    mock.timers.tick(1000);
    assert.equal(persisted.at(-1)?.content, 'Words on screen');
    assert.equal(persisted.at(-1)?.cutOff, 'interrupted');
  } finally {
    mock.timers.reset();
  }
});
