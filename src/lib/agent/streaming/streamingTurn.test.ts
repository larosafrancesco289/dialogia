import { ANTHROPIC_ENDPOINT, OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeStreamingTurn } from '@/lib/agent/streaming/streamingTurn';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { buildTransportAuth } from '@/lib/auth/transport';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage } from '@/lib/messages/createMessage';
import { buildMessageIndex } from '@/lib/messages/indexing';
import type { Message, ModelDescriptor } from '@/lib/types';
import type { ModelMessage, ToolDefinition } from '@/lib/agent/types';
import type { StreamCallbacks } from '@/lib/transport/types';
import { missingBuiltInFolders } from '@/lib/memory/notebook';
import { registerMemoryTools } from '@/lib/tools/core/memoryTools';
import { MEMORY_TOOLS } from '@/lib/tools/definitions/memory';
import { createTestStoreState } from '../../../../tests/helpers/createTestStoreState';
import { makeChat } from '../../../../tests/helpers/makeChat';

// Tools no module registers: their calls fail as unsupported, which is enough
// to drive the loop through its tool rounds.
const TOOLS: ToolDefinition[] = ['advance_topic', 'quiz'].map((name) => ({
  type: 'function',
  function: { name, description: name, parameters: { type: 'object', properties: {} } },
}));

registerMemoryTools();

const OPENROUTER_MODEL: ModelDescriptor = {
  id: 'provider/model',
  name: 'Provider Model',
  context_length: 16000,
  pricing: undefined,
  raw: { supported_parameters: ['tools'] },
};

type Round = (ctx: { callbacks: StreamCallbacks | undefined }) => void;

const USAGE = { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 };

/** Streams some text, then asks for one tool. */
const draftThenTool =
  (
    draft: string,
    name: string,
    args = '{}',
    finishReason: 'tool_calls' | 'stop' = 'tool_calls',
  ): Round =>
  ({ callbacks }) => {
    callbacks?.onToolCallDelta?.([{ index: 0, function: { name } }]);
    callbacks?.onToken?.(draft);
    callbacks?.onDone?.(draft, {
      finishReason,
      usage: USAGE,
      toolCalls: [{ id: `call_${args}`, type: 'function', function: { name, arguments: args } }],
    });
  };

const finish =
  (text: string): Round =>
  ({ callbacks }) => {
    callbacks?.onToken?.(text);
    callbacks?.onDone?.(text, { finishReason: 'stop', usage: USAGE });
  };

/** One tutor turn through `executeStreamingTurn`, answering each model call with the next round. */
async function runTurn({
  rounds,
  model = OPENROUTER_MODEL,
  endpoint = OPENROUTER_ENDPOINT,
  tools = TOOLS,
}: {
  rounds: Round[];
  model?: ModelDescriptor;
  endpoint?: typeof OPENROUTER_ENDPOINT;
  tools?: ToolDefinition[];
}) {
  const chatId = `chat-streaming-${Math.random().toString(36).slice(2)}`;
  const chat = makeChat({
    id: chatId,
    title: 'Tutor chat',
    settings: {
      modelId: model.id,
      features: { tutor: { enabled: true, defaultModelId: model.id } },
    },
  });
  const assistantMessage = createAssistantMessage({
    id: `${chatId}-assistant`,
    chatId,
    content: '',
    model: model.id,
    createdAt: Date.now(),
  });
  const memoryChanges: unknown[] = [];
  const { state, set, get } = createTestStoreState({
    chats: [chat],
    ...buildMessageIndex({ [chatId]: [assistantMessage] }),
    models: [model],
    modelIndex: createModelIndex([model]),
    memory: { folders: missingBuiltInFolders([], 1), notes: [], loaded: true },
    changeMemory: async (change) => {
      memoryChanges.push(change);
    },
  });

  const persisted: Message[] = [];
  const requests: ModelMessage[][] = [];
  const roles: string[][] = [];
  const toolChoices: unknown[] = [];
  // What the reply showed when each call went out.
  const visibleAtStart: string[] = [];
  const pipeline = createPipelineClient({
    streamChatCompletion: async ({ callbacks, messages, toolChoice }) => {
      requests.push(messages);
      roles.push(messages.map((message) => message.role));
      toolChoices.push(toolChoice);
      visibleAtStart.push(get().messagesById[assistantMessage.id]?.content ?? '');
      const round = rounds[Math.min(roles.length, rounds.length) - 1];
      round({ callbacks });
    },
  });

  const userContent = 'Teach me one-step equations.';
  const result = await executeStreamingTurn({
    chat,
    chatId,
    assistantMessage,
    messages: [
      { role: 'system', content: 'You are a tutor.' },
      { role: 'user', content: userContent },
    ],
    controller: new AbortController(),
    turn: {
      auth: buildTransportAuth({ endpoint, apiKey: 'test-key' }),
      set,
      get,
      models: [model],
      modelIndex: state.modelIndex,
      persistMessage: async (message) => {
        persisted.push(message);
      },
    },
    settings: {
      modelId: model.id,
      modelMeta: model,
      caps: { canReason: false, canSee: false, canAudio: false, canImageOut: false },
      generation: {},
      searchEnabled: false,
      searchProvider: 'openrouter',
      tutorEnabled: true,
      timestampsEnabled: false,
      system: undefined,
    },
    toolDefinition: tools,
    userContent,
    combinedSystem: 'You are a tutor.',
    pipeline,
  });

  return {
    result,
    calls: roles.length,
    requests,
    roles,
    toolChoices,
    visibleAtStart,
    memoryChanges,
    message: get().messagesById[assistantMessage.id],
    lastPersisted: persisted[persisted.length - 1],
  };
}

const ANSWER = 'Subtract 3 from both sides, then divide by 2: x = 4.';

test('executeStreamingTurn writes the answer once: the round after the tools is the reply', async () => {
  const run = await runTurn({
    rounds: [draftThenTool('Let me look that up.', 'quiz'), finish(ANSWER), finish('a rewrite')],
  });

  assert.equal(run.calls, 2, 'no second call rewrites the answer');
  assert.deepEqual(run.toolChoices, ['auto', 'auto']);
  // The narration before the tool call is gone before the answer streams.
  assert.equal(run.visibleAtStart[1], '');
  assert.equal(run.message?.content, ANSWER);
  assert.equal(run.lastPersisted?.content, ANSWER);
  assert.equal(run.lastPersisted?.usage?.prompt_tokens, 200, 'usage covers both rounds');
});

test('executeStreamingTurn closes with tools withheld once the tool rounds run out', async () => {
  const run = await runTurn({
    rounds: [
      draftThenTool('Checking.', 'quiz', '{"n":1}'),
      draftThenTool('Checking again.', 'quiz', '{"n":2}'),
      draftThenTool('One more.', 'quiz', '{"n":3}'),
      finish(ANSWER),
    ],
  });

  assert.equal(run.calls, 4);
  assert.deepEqual(run.toolChoices, ['auto', 'auto', 'auto', 'none']);
  assert.equal(run.message?.content, ANSWER);
});

test('executeStreamingTurn clears a cut-off first reply before retrying it', async () => {
  const run = await runTurn({ rounds: [finish('To solve this we:'), finish(ANSWER)] });

  assert.equal(run.calls, 2);
  assert.equal(run.visibleAtStart[1], '');
  assert.equal(run.message?.content, ANSWER);
});

test('executeStreamingTurn omits follow-up user prompt after Anthropic tool results', async () => {
  const run = await runTurn({
    endpoint: ANTHROPIC_ENDPOINT,
    model: {
      id: 'anthropic-direct/claude-haiku-4-5',
      name: 'Claude Haiku 4.5',
      context_length: 200000,
      pricing: undefined,
      raw: { supported_parameters: ['tools'] },
      endpointId: 'anthropic',
      transportModelId: 'claude-haiku-4-5-20251001',
      providerDisplay: 'Anthropic',
    },
    rounds: [draftThenTool('Let me check.', 'advance_topic'), finish(ANSWER)],
  });

  assert.equal(run.calls, 2);
  assert.deepEqual(run.roles[1], ['system', 'user', 'assistant', 'tool']);
  assert.equal(run.message?.content, ANSWER);
});

const SAVE = JSON.stringify({ folder: 'About you', note: 'Solving linear equations' });

test('executeStreamingTurn keeps an answer followed by a memory save, and adds nothing when the save worked', async () => {
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [draftThenTool(ANSWER, 'memory_save', SAVE), finish('')],
  });

  assert.equal(run.calls, 2);
  assert.equal(run.memoryChanges.length, 1, 'the save ran');
  // The answer stays on screen, and the next round reads it as its own turn.
  assert.equal(run.visibleAtStart[1], ANSWER);
  const [assistant, tool, nudge] = run.requests[1]!.slice(-3);
  assert.equal(assistant?.role, 'assistant');
  assert.ok(JSON.stringify(assistant?.content).includes(ANSWER));
  assert.equal(assistant?.role === 'assistant' && assistant.tool_calls?.length, 1);
  assert.match(String(tool?.content), /"ok":true/);
  assert.match(String(nudge?.content), /do not repeat it/);
  assert.equal(run.message?.content, ANSWER);
  assert.equal(run.lastPersisted?.content, ANSWER);
  assert.equal(run.lastPersisted?.memoryWrites?.[0]?.text, 'Solving linear equations');
  assert.equal(run.lastPersisted?.usage?.prompt_tokens, 200, 'usage covers both rounds');
  assert.equal(run.lastPersisted?.finishReason, 'stop');
  assert.equal(run.lastPersisted?.cutOff, undefined);
  assert.ok(!run.lastPersisted?.toolCalls?.some((entry) => entry.status === 'pending'));
});

test('executeStreamingTurn lets the model read a memory save that failed', async () => {
  const failing = JSON.stringify({ folder: 'Recipes', note: 'Likes risotto' });
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [draftThenTool('Noted.', 'memory_save', failing), finish('')],
  });

  assert.equal(run.calls, 2);
  assert.equal(run.memoryChanges.length, 0);
  const tool = run.requests[1]!.find((message) => message.role === 'tool');
  assert.match(String(tool?.content), /"ok":false/);
  assert.equal(run.message?.content, 'Noted.');
});

test('executeStreamingTurn adds the answer after a preamble that saved a note', async () => {
  const preamble = 'Noted, let me save that first.';
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [draftThenTool(preamble, 'memory_save', SAVE), finish(ANSWER)],
  });

  assert.equal(run.calls, 2);
  assert.deepEqual(run.toolChoices, ['auto', 'auto']);
  assert.equal(run.visibleAtStart[1], preamble);
  assert.equal(run.message?.content, `${preamble}\n\n${ANSWER}`);
  assert.equal(run.lastPersisted?.content, `${preamble}\n\n${ANSWER}`);
  assert.equal(run.lastPersisted?.memoryWrites?.length, 1);
});

test('executeStreamingTurn writes the whole answer again when the added round calls another tool', async () => {
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [
      draftThenTool('Noted.', 'memory_save', SAVE),
      draftThenTool('Let me check.', 'quiz'),
      finish(ANSWER),
    ],
  });

  assert.equal(run.calls, 3);
  assert.equal(run.visibleAtStart[2], '');
  assert.equal(run.message?.content, ANSWER);
  assert.equal(run.lastPersisted?.memoryWrites?.length, 1);
});

test('executeStreamingTurn runs tool calls that arrive with finish reason stop', async () => {
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [draftThenTool(ANSWER, 'memory_save', SAVE, 'stop'), finish('')],
  });

  assert.equal(run.calls, 2);
  assert.equal(run.memoryChanges.length, 1);
  assert.equal(run.lastPersisted?.content, ANSWER);
});

test('executeStreamingTurn writes the answer again after a memory read', async () => {
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [
      draftThenTool(ANSWER, 'memory_read', JSON.stringify({ folder: 'About you' })),
      finish('A rewrite.'),
    ],
  });

  assert.equal(run.calls, 2);
  assert.equal(run.visibleAtStart[1], '');
  assert.equal(run.message?.content, 'A rewrite.');
});

test('executeStreamingTurn writes the answer after a memory save that came before any', async () => {
  const run = await runTurn({
    tools: [...TOOLS, ...MEMORY_TOOLS],
    rounds: [draftThenTool('', 'memory_save', SAVE), finish(ANSWER)],
  });

  assert.equal(run.calls, 2);
  assert.equal(run.memoryChanges.length, 1);
  assert.equal(run.message?.content, ANSWER);
  assert.equal(run.lastPersisted?.memoryWrites?.length, 1);
});

test('executeStreamingTurn never runs a call to a tool the turn did not offer, and keeps the answer', async () => {
  const run = await runTurn({
    rounds: [draftThenTool(ANSWER, 'memory_save', SAVE), finish('a rewrite')],
  });

  assert.equal(run.memoryChanges.length, 0);
  assert.equal(run.lastPersisted?.memoryWrites, undefined);
  // Nothing ran, so nothing follows: the answer is the reply.
  assert.equal(run.calls, 1);
  assert.equal(run.lastPersisted?.content, ANSWER);
  assert.equal(run.lastPersisted?.finishReason, 'stop');
  assert.ok(!run.lastPersisted?.toolCalls?.some((entry) => entry.status === 'pending'));
});

test('executeStreamingTurn closes with tools withheld when an unoffered call follows a cut-off draft', async () => {
  const run = await runTurn({
    rounds: [draftThenTool('Let me note that:', 'memory_save', SAVE), finish(ANSWER)],
  });

  assert.equal(run.memoryChanges.length, 0);
  assert.deepEqual(run.toolChoices, ['auto', 'none']);
  assert.equal(run.visibleAtStart[1], '');
  assert.equal(run.lastPersisted?.content, ANSWER);
});
