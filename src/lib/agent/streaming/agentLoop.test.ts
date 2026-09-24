import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { executeStreamingTurn } from '@/lib/agent/streaming/streamingTurn';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { AGENT_MAX_ROUNDS } from '@/lib/agent/streaming/agentLoop';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { createModelIndex } from '@/lib/models';
import { loadModuleRuntimes } from '@/lib/modules';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { buildMessageIndex } from '@/lib/messages/indexing';
import { registerTool, type PlanningToolHandler } from '@/lib/tools';
import type { ModelMessage, ToolCall, ToolDefinition } from '@/lib/agent/types';
import type { StreamCallbacks, TransportStreamParams } from '@/lib/transport/types';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { createTestStoreState } from '../../../../tests/helpers/createTestStoreState';

const definition = (name: string): ToolDefinition => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
});

const handler =
  (respond: (args: Record<string, unknown>) => Awaited<ReturnType<PlanningToolHandler>>) =>
  async ({ toolCall, parsedArgs, context }: Parameters<PlanningToolHandler>[0]) => {
    const log = context.logger.start({ name: toolCall.function.name, input: parsedArgs });
    const outcome = respond(parsedArgs);
    log.success({ ok: true });
    return outcome;
  };

const TOOL_NOTE = 'agent_test_note';
const TOOL_CARD = 'agent_test_card';
const TOOL_STRICT = 'agent_test_strict';
const TOOL_LOOKUP = 'agent_test_lookup';
const TOOL_STOP = 'agent_test_stop';
const TOOL_SHOWN = 'agent_test_shown';

let stopController: AbortController | undefined;

before(async () => {
  await loadModuleRuntimes();
  const register = (name: string, replay: boolean, respond: Parameters<typeof handler>[0]): void =>
    registerTool(name, {
      definition: definition(name),
      metadata: { module: 'agent-test', kind: 'action', replay },
      handler: handler(respond),
    });
  register(TOOL_NOTE, true, (args) => ({
    usedTool: true,
    usedContentTool: false,
    result: { ok: true, noted: args.what ?? null },
  }));
  register(TOOL_CARD, true, () => ({
    usedTool: true,
    usedContentTool: false,
    result: { ok: true, shown: 'card' },
    endsTurn: true,
    replay: { arguments: { question: 'Q' }, result: { ok: true, shown: 'card' } },
  }));
  register(TOOL_STRICT, true, (args) =>
    args.node === 'a'
      ? { usedTool: true, usedContentTool: false, result: { ok: true, node: 'a' } }
      : {
          usedTool: false,
          usedContentTool: false,
          result: {
            ok: false,
            error: `Unknown node "${String(args.node)}"`,
            hint: 'Use one of: a',
          },
        },
  );
  register(TOOL_LOOKUP, false, () => ({
    usedTool: true,
    usedContentTool: false,
    result: { ok: true, found: 'bulky results' },
  }));
  register(TOOL_SHOWN, true, () => ({
    usedTool: true,
    usedContentTool: true,
    result: { ok: true, shown: 'card' },
    endsTurn: 'after_text',
    resultBeforeText: { ok: true, shown: 'card', note: 'Introduce it.' },
  }));
  register(TOOL_STOP, true, () => {
    stopController?.abort();
    return { usedTool: true, usedContentTool: false, result: { ok: true } };
  });
});

const call = (name: string, args: Record<string, unknown> = {}, id = `${name}-1`): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

type Script = (
  round: number,
  callbacks: StreamCallbacks | undefined,
  params: TransportStreamParams,
) => void | Promise<void>;

/** Streams `text` then finishes with the given calls. */
const reply = (
  callbacks: StreamCallbacks | undefined,
  text: string,
  toolCalls?: ToolCall[],
  finishReason: 'stop' | 'tool_calls' = toolCalls?.length ? 'tool_calls' : 'stop',
) => {
  if (toolCalls?.length) {
    callbacks?.onToolCallDelta?.(
      toolCalls.map((tc, index) => ({ index, id: tc.id, function: { name: tc.function.name } })),
    );
  }
  if (text) callbacks?.onToken?.(text);
  callbacks?.onDone?.(text, { finishReason, toolCalls });
};

async function runAgentTurn(
  script: Script,
  options: { controller?: AbortController; viaRunTurn?: boolean } = {},
) {
  const chatId = `chat-agent-${Math.random().toString(36).slice(2)}`;
  const model: ModelDescriptor = {
    id: 'provider/model',
    name: 'Provider Model',
    context_length: 16000,
    pricing: undefined,
    raw: { supported_parameters: ['tools'] },
  };
  const chat: Chat = {
    id: chatId,
    title: 'Agent chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      modelId: model.id,
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: { search: { enabled: false, provider: 'openrouter' } },
    },
  };
  const assistantMessage = createAssistantMessage({
    id: `${chatId}-assistant`,
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });
  const { messagesById, messageIdsByChatId } = buildMessageIndex({ [chatId]: [assistantMessage] });
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    messagesById,
    messageIdsByChatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });

  const persisted: Message[] = [];
  const requests: TransportStreamParams[] = [];
  const visibleAtRoundStart: string[] = [];
  const pipeline = createPipelineClient({
    streamChatCompletion: async (params) => {
      requests.push(params);
      visibleAtRoundStart.push(get().messagesById[assistantMessage.id]?.content ?? '');
      await script(requests.length, params.callbacks, params);
    },
  });

  const controller = options.controller ?? new AbortController();
  const auth = buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' });
  const baseTurnContext = {
    set,
    get,
    models: [model],
    modelIndex: state.modelIndex,
    persistMessage: async (message: Message) => {
      persisted.push(message);
    },
  };
  const settings = {
    modelId: model.id,
    modelMeta: model,
    caps: { canReason: false, canSee: false, canAudio: false, canImageOut: false },
    generation: {},
    searchEnabled: false,
    searchProvider: 'openrouter',
    tutorEnabled: false,
    timestampsEnabled: false,
    system: undefined,
  };
  const messages: ModelMessage[] = [
    { role: 'system', content: 'You are an agent.' },
    { role: 'user', content: 'Go.' },
  ];
  const tools = [TOOL_NOTE, TOOL_CARD, TOOL_STRICT, TOOL_LOOKUP, TOOL_STOP, TOOL_SHOWN].map(
    definition,
  );
  const run = options.viaRunTurn
    ? runTurn({
        chat,
        chatId,
        modelId: model.id,
        userContent: 'Go.',
        assistantMessage,
        priorMessages: [],
        ui: get().ui,
        settings,
        controller,
        baseTurnContext,
        // Not a planning turn: only the module's request for the agent loop routes it.
        compose: async () => ({
          system: 'You are an agent.',
          messages,
          tools,
          hasPdf: false,
          shouldPlan: false,
          loop: 'agent',
          settings,
        }),
        plan: async () => assert.fail('the agent loop never runs the legacy planner'),
        streamFinal: async () => assert.fail('the agent loop never runs the plain stream'),
        authResolver: () => auth,
        pipeline,
      })
    : executeStreamingTurn({
        chat,
        chatId,
        assistantMessage,
        messages,
        controller,
        turn: { ...baseTurnContext, auth },
        settings,
        toolDefinition: tools,
        startBuffered: false,
        userContent: 'Go.',
        combinedSystem: 'You are an agent.',
        pipeline,
        loop: 'agent',
      });

  return {
    run,
    requests,
    visibleAtRoundStart,
    persisted,
    message: () => get().messagesById[assistantMessage.id],
  };
}

const roles = (messages: ModelMessage[]) => messages.map((message) => message.role);
const toolMessages = (messages: ModelMessage[]) =>
  messages.filter((message): message is Extract<ModelMessage, { role: 'tool' }> => {
    return message.role === 'tool';
  });

test('agent loop streams every round visibly into one reply', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, 'First, a note.', [call(TOOL_NOTE, { what: 'x' })]);
    return reply(callbacks, 'Then the answer.');
  });
  const result = await turn.run;

  assert.equal(turn.requests.length, 2);
  assert.notEqual(result.shortCircuited, true);
  // Round one's text stays on screen while round two streams.
  assert.equal(turn.visibleAtRoundStart[1], 'First, a note.');
  assert.equal(turn.message()?.content, 'First, a note.\n\nThen the answer.');
  assert.equal(turn.persisted.at(-1)?.content, 'First, a note.\n\nThen the answer.');

  // The second call sees the real tool exchange, with no nudge message after it.
  const second = turn.requests[1].messages;
  assert.deepEqual(roles(second), ['system', 'user', 'assistant', 'tool']);
  const assistant = second[2] as Extract<ModelMessage, { role: 'assistant' }>;
  assert.equal(assistant.tool_calls?.[0]?.function.name, TOOL_NOTE);
  assert.deepEqual(JSON.parse(toolMessages(second)[0].content), { ok: true, noted: 'x' });
  assert.equal(turn.requests[1].toolChoice, 'auto');

  // The ledger settled, and the replayable round is on the message.
  assert.ok(turn.message()?.toolCalls?.every((entry) => entry.status !== 'pending'));
  assert.deepEqual(turn.persisted.at(-1)?.toolRounds, [
    {
      text: 'First, a note.',
      calls: [
        {
          id: `${TOOL_NOTE}-1`,
          name: TOOL_NOTE,
          arguments: '{"what":"x"}',
          result: '{"ok":true,"noted":"x"}',
        },
      ],
    },
  ]);
});

test('agent loop stops without another call when a handler ends the turn', async () => {
  const turn = await runAgentTurn((_round, callbacks) =>
    reply(callbacks, 'Try this one.', [call(TOOL_CARD, { question: 'Q', answer: 'secret' })]),
  );
  await turn.run;

  assert.equal(turn.requests.length, 1);
  assert.equal(turn.message()?.content, 'Try this one.');
  // The replay override keeps the answer key out of later turns.
  const stored = turn.persisted.at(-1)?.toolRounds?.[0]?.calls[0];
  assert.equal(stored?.arguments, '{"question":"Q"}');
  assert.equal(stored?.result, '{"ok":true,"shown":"card"}');
});

test('a card that ends the turn after text stops at once when the turn has words', async () => {
  const turn = await runAgentTurn((_round, callbacks) =>
    reply(callbacks, 'Here is a quick check.', [call(TOOL_SHOWN)]),
  );
  await turn.run;

  assert.equal(turn.requests.length, 1);
  assert.equal(turn.message()?.content, 'Here is a quick check.');
  const stored = turn.persisted.at(-1)?.toolRounds?.[0]?.calls[0];
  assert.deepEqual(JSON.parse(String(stored?.result)), { ok: true, shown: 'card' });
});

test('a card shown without a word gets one more round, without tools, to introduce it', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, '', [call(TOOL_SHOWN)]);
    // A model that calls a tool anyway is not run: this round is the last.
    return reply(callbacks, 'This checks the base rate. Take your time.', [
      call(TOOL_NOTE, {}, 'note-late'),
    ]);
  });
  await turn.run;

  assert.equal(turn.requests.length, 2);
  assert.deepEqual(
    turn.requests.map((request) => request.toolChoice),
    ['auto', 'none'],
  );
  // The model reads the handler's ask, not the ordinary result.
  const [shown] = toolMessages(turn.requests[1].messages);
  assert.deepEqual(JSON.parse(shown.content), { ok: true, shown: 'card', note: 'Introduce it.' });
  // The introduction is the reply's text, so it sits above the card.
  assert.equal(turn.message()?.content, 'This checks the base rate. Take your time.');
  assert.equal(
    turn.message()?.toolCalls?.some((entry) => entry.name === TOOL_NOTE),
    false,
    'the late call never ran',
  );
  const rounds = turn.persisted.at(-1)?.toolRounds;
  assert.equal(rounds?.length, 1);
  assert.equal(rounds?.[0].text, '');
  assert.match(String(rounds?.[0].calls[0].result), /Introduce it/);
});

test('a card after an earlier round with words ends the turn without an introduction', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, 'Noted.', [call(TOOL_NOTE)]);
    return reply(callbacks, '', [call(TOOL_SHOWN)]);
  });
  await turn.run;

  assert.equal(turn.requests.length, 2);
  assert.equal(turn.message()?.content, 'Noted.');
});

test('agent loop caps its rounds and forbids tools on the last one', async () => {
  const turn = await runAgentTurn((round, callbacks) =>
    reply(callbacks, `Round ${round}.`, [call(TOOL_NOTE, {}, `note-${round}`)]),
  );
  await turn.run;

  assert.equal(turn.requests.length, AGENT_MAX_ROUNDS);
  assert.deepEqual(
    turn.requests.map((request) => request.toolChoice),
    [...Array(AGENT_MAX_ROUNDS - 1).fill('auto'), 'none'],
  );
  assert.equal(
    turn.message()?.content,
    Array.from({ length: AGENT_MAX_ROUNDS }, (_, i) => `Round ${i + 1}.`).join('\n\n'),
  );
  // The calls of the last round were never run, and nothing is left pending.
  assert.equal(turn.persisted.at(-1)?.toolRounds?.length, AGENT_MAX_ROUNDS - 1);
  assert.ok(turn.message()?.toolCalls?.every((entry) => entry.status !== 'pending'));
});

test('agent loop runs tool calls even when the finish reason is not tool_calls', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, 'Noting.', [call(TOOL_NOTE)], 'stop');
    return reply(callbacks, 'Done.');
  });
  await turn.run;

  assert.equal(turn.requests.length, 2);
  assert.equal(toolMessages(turn.requests[1].messages).length, 1);
  assert.equal(turn.message()?.content, 'Noting.\n\nDone.');
});

test('agent loop hands a structured error back and lets the model retry', async () => {
  const turn = await runAgentTurn((round, callbacks, params) => {
    if (round === 1) return reply(callbacks, '', [call(TOOL_STRICT, { node: 'x' }, 'strict-1')]);
    if (round === 2) {
      const error = JSON.parse(toolMessages(params.messages)[0].content);
      assert.equal(error.ok, false);
      assert.match(error.error, /Unknown node "x"/);
      assert.equal(error.hint, 'Use one of: a');
      return reply(callbacks, 'Fixed it.', [call(TOOL_STRICT, { node: 'a' }, 'strict-2')]);
    }
    return reply(callbacks, 'All set.');
  });
  await turn.run;

  assert.equal(turn.requests.length, 3);
  const results = toolMessages(turn.requests[2].messages).map((m) => JSON.parse(m.content));
  assert.deepEqual(
    results.map((r) => r.ok),
    [false, true],
  );
  assert.equal(turn.message()?.content, 'Fixed it.\n\nAll set.');
});

test('agent loop says so when a failed call is repeated verbatim in a later round', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, '', [call(TOOL_STRICT, { node: 'x' }, 'strict-1')]);
    // The same failing call, keys reordered, then a different failing one.
    if (round === 2) {
      return reply(callbacks, '', [
        {
          id: 'strict-2',
          type: 'function',
          function: { name: TOOL_STRICT, arguments: '{ "node" : "x" }' },
        },
        call(TOOL_STRICT, { node: 'y' }, 'strict-3'),
      ]);
    }
    return reply(callbacks, 'Giving up on that.');
  });
  await turn.run;

  const results = toolMessages(turn.requests[2].messages).map((m) => JSON.parse(m.content));
  assert.equal(results.length, 3);
  assert.equal(results[0].repeated, undefined, 'a first failure is not a repeat');
  assert.match(String(results[1].repeated), /identical to one that already failed/);
  assert.match(String(results[1].repeated), new RegExp(TOOL_STRICT));
  assert.equal(results[1].hint, 'Use one of: a', 'the original hint stays');
  assert.equal(results[2].repeated, undefined, 'different arguments are not a repeat');
  const stored = turn.persisted.at(-1)?.toolRounds?.[1]?.calls[0];
  assert.match(String(stored?.result), /repeated/);
});

test('agent loop answers calls the scheduler dropped instead of leaving them unanswered', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, 'Hmm.', [call('agent_test_unknown', {}, 'nope-1')]);
    return reply(callbacks, 'Never mind.');
  });
  await turn.run;

  const second = turn.requests[1].messages;
  assert.deepEqual(roles(second), ['system', 'user', 'assistant', 'tool']);
  assert.equal(JSON.parse(toolMessages(second)[0].content).ok, false);
});

test('agent loop replays only rounds of replayable tools, carrying the other text along', async () => {
  const turn = await runAgentTurn((round, callbacks) => {
    if (round === 1) return reply(callbacks, 'Looking.', [call(TOOL_LOOKUP)]);
    if (round === 2) return reply(callbacks, 'Noting.', [call(TOOL_NOTE)]);
    return reply(callbacks, 'Done.');
  });
  await turn.run;

  const rounds = turn.persisted.at(-1)?.toolRounds;
  assert.equal(rounds?.length, 1);
  assert.equal(rounds?.[0].text, 'Looking.\n\nNoting.');
  assert.deepEqual(
    rounds?.[0].calls.map((c) => c.name),
    [TOOL_NOTE],
  );
  assert.equal(turn.message()?.content, 'Looking.\n\nNoting.\n\nDone.');
});

test('agent loop stops cleanly when the user stops it during a tool round', async () => {
  const controller = new AbortController();
  stopController = controller;
  const turn = await runAgentTurn(
    (_round, callbacks) =>
      reply(callbacks, 'Working on it.', [call(TOOL_STOP), call(TOOL_NOTE, {}, 'note-x')]),
    { controller },
  );

  await assert.rejects(turn.run, (error: Error) => error.name === 'AbortError');
  stopController = undefined;

  assert.equal(turn.requests.length, 1, 'no model call after the stop');
  const message = turn.message();
  // The call queued behind the stop never ran; its ledger row says so.
  const note = message?.toolCalls?.find((entry) => entry.name === TOOL_NOTE);
  assert.equal(note?.status ?? 'error', 'error');
  assert.equal(message?.content, 'Working on it.');
  assert.ok(message?.toolCalls?.every((entry) => entry.status !== 'pending'));
  assert.equal(turn.persisted.at(-1)?.content, 'Working on it.');
});

test('agent loop stops cleanly when the user stops it mid-stream', async () => {
  const controller = new AbortController();
  const turn = await runAgentTurn(
    (_round, callbacks) => {
      callbacks?.onToolCallDelta?.([{ index: 0, id: 'c', function: { name: TOOL_NOTE } }]);
      callbacks?.onToken?.('Partial');
      controller.abort();
      const error = new Error('aborted');
      error.name = 'AbortError';
      callbacks?.onError?.(error);
      throw error;
    },
    { controller },
  );

  await assert.rejects(turn.run, (error: Error) => error.name === 'AbortError');
  assert.equal(turn.requests.length, 1);
  assert.equal(turn.message()?.content, 'Partial');
  assert.equal(turn.persisted.at(-1)?.content, 'Partial');
  assert.ok(turn.message()?.toolCalls?.every((entry) => entry.status !== 'pending'));
  assert.ok(turn.persisted.at(-1)?.toolCalls?.every((entry) => entry.status !== 'pending') ?? true);
});

test('a composition asking for the agent loop routes the turn into it', async () => {
  const turn = await runAgentTurn(
    (round, callbacks) => {
      if (round === 1) return reply(callbacks, 'One.', [call(TOOL_NOTE)]);
      return reply(callbacks, 'Two.');
    },
    { viaRunTurn: true },
  );
  const result = await turn.run;

  assert.equal(result.shortCircuited, false);
  assert.equal(turn.requests.length, 2);
  assert.equal(turn.message()?.content, 'One.\n\nTwo.');
});
