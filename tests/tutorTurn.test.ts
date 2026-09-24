// A whole tutoring session through the real turn pipeline (compose, agent loop,
// registry, handlers, store, engine), with a scripted model in place of the network.

import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';
import type { StateCreator } from 'zustand';
import { composeTurn } from '@/lib/agent/compose';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { createPipelineClient } from '@/lib/agent/pipelineClient';
import { regenerate } from '@/lib/agent/regenerate';
import { buildTransportAuth } from '@/lib/auth/transport';
import { loadModuleRuntimes } from '@/lib/modules';
import { createModelIndex } from '@/lib/models';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { buildStoreInitializer } from '@/lib/store/createStore';
import type { StoreState } from '@/lib/store/types';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import type { StreamCallbacks, TransportStreamParams } from '@/lib/transport/types';
import type { ModelMessage, ToolCall } from '@/lib/agent/types';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import { TUTOR_SYSTEM_PROMPT } from '@/modules/tutor/agent/systemPrompt';

before(async () => {
  await loadModuleRuntimes();
});

const model: ModelDescriptor = {
  id: 'provider/tutor-model',
  name: 'Tutor Model',
  context_length: 32000,
  pricing: undefined,
  raw: { supported_parameters: ['tools'] },
};

const call = (name: string, args: Record<string, unknown>, id: string): ToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

/** Streams `text`, then ends the round with the given calls (if any). */
const reply = (callbacks: StreamCallbacks | undefined, text: string, toolCalls?: ToolCall[]) => {
  if (toolCalls?.length) {
    callbacks?.onToolCallDelta?.(
      toolCalls.map((tc, index) => ({ index, id: tc.id, function: { name: tc.function.name } })),
    );
  }
  if (text) callbacks?.onToken?.(text);
  callbacks?.onDone?.(text, {
    finishReason: toolCalls?.length ? 'tool_calls' : 'stop',
    toolCalls,
  });
};

type Script = (round: number, callbacks: StreamCallbacks | undefined) => void;

function textOf(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('\n\n');
}

const systemOf = (params: TransportStreamParams) =>
  textOf(params.messages.find((m) => m.role === 'system')?.content ?? '');

const toolNames = (params: TransportStreamParams) =>
  (params.tools ?? []).map((tool) => tool.function.name);

/** The assistant tool calls a request carries, with the result each one got back. */
function toolExchanges(params: TransportStreamParams) {
  const out: Array<{ name: string; result: Record<string, unknown> }> = [];
  params.messages.forEach((message) => {
    if (message.role !== 'assistant' || !message.tool_calls?.length) return;
    for (const tc of message.tool_calls) {
      const answer = params.messages.find(
        (m): m is Extract<ModelMessage, { role: 'tool' }> =>
          m.role === 'tool' && m.tool_call_id === tc.id,
      );
      out.push({ name: tc.function.name, result: JSON.parse(answer?.content ?? '{}') });
    }
  });
  return out;
}

function session() {
  const chatId = `chat-turn-${Math.random().toString(36).slice(2)}`;
  const chat: Chat = {
    id: chatId,
    title: 'Calculus',
    createdAt: 1,
    updatedAt: 1,
    settings: {
      modelId: model.id,
      system: 'You are a helpful assistant.',
      generation: {},
      ui: {
        showThinkingByDefault: false,
        showStats: false,
        showToolCallLog: false,
        showDebugRawJson: false,
      },
      features: {
        search: { enabled: false, provider: 'openrouter' },
        tutor: { enabled: true, defaultModelId: model.id },
      },
    },
  };
  const store = createStore<StoreState>(
    buildStoreInitializer() as unknown as StateCreator<StoreState>,
  );
  store.setState({
    chats: [chat],
    selectedChatId: chatId,
    models: [model],
    modelIndex: createModelIndex([model]),
  });
  const auth = buildTransportAuth({ endpoint: OPENROUTER_ENDPOINT, apiKey: 'test-key' });
  let clock = 10_000;

  const turn = async (userText: string, script: Script) => {
    const requests: TransportStreamParams[] = [];
    const pipeline = createPipelineClient({
      streamChatCompletion: async (params) => {
        requests.push(params);
        script(requests.length, params.callbacks);
      },
    });
    const prior = getMessagesForChat(store.getState(), chatId);
    const user = createUserMessage({ chatId, content: userText, createdAt: (clock += 1) });
    const assistant = createAssistantMessage({
      chatId,
      content: '',
      model: model.id,
      createdAt: (clock += 1),
    });
    store.setState((s) => appendMessagesToChat(s, chatId, [user, assistant]));
    const updateMessage = (patch: Partial<Message>) =>
      store.setState(
        (s) => updateMessageById(s, chatId, assistant.id, (m) => ({ ...m, ...patch })) ?? {},
      );
    const lifecycle = createTurnLifecycle({
      chatId,
      assistantMessageId: assistant.id,
      isPrimary: true,
      priorMessages: prior,
      getChatForTurn: () => store.getState().chats[0],
      set: store.setState,
      get: store.getState,
      updateMessage,
    });
    const settings = resolveTurnSettings({
      chat,
      ui: store.getState().ui,
      modelIndex: store.getState().modelIndex,
      modelId: model.id,
    });
    assert.equal(settings.tutorEnabled, true);
    await runTurn({
      chat,
      chatId,
      modelId: model.id,
      userContent: userText,
      assistantMessage: assistant,
      priorMessages: prior,
      ui: store.getState().ui,
      settings,
      controller: new AbortController(),
      baseTurnContext: {
        set: store.setState,
        get: store.getState,
        models: [model],
        modelIndex: store.getState().modelIndex,
        persistMessage: async () => {},
      },
      compose: composeTurn,
      plan: async () => assert.fail('a tutor turn never runs the legacy planner'),
      streamFinal: async () => assert.fail('a tutor turn with tools is the agent loop'),
      authResolver: () => auth,
      hooks: lifecycle.hooks,
      pipeline,
    });
    return { requests, message: () => store.getState().messagesById[assistant.id] };
  };

  /** Regenerates a reply the way the app does: retract what it recorded, then rerun it. */
  const regenerateReply = async (messageId: string, script: Script) => {
    const requests: TransportStreamParams[] = [];
    const pipeline = createPipelineClient({
      streamChatCompletion: async (params) => {
        requests.push(params);
        script(requests.length, params.callbacks);
      },
    });
    await store.getState().retractTutorReply(chatId, messageId);
    await regenerate({
      chat: store.getState().chats[0],
      chatId,
      targetMessageId: messageId,
      messages: getMessagesForChat(store.getState(), chatId),
      turn: {
        auth,
        set: store.setState,
        get: store.getState,
        models: [model],
        modelIndex: store.getState().modelIndex,
        persistMessage: async () => {},
      },
      controller: new AbortController(),
      pipeline,
    });
    return { requests, message: () => store.getState().messagesById[messageId] };
  };

  const tutor = () => store.getState().tutorSessions[chatId];
  return { chatId, store, turn, tutor, regenerateReply };
}

const PLAN = {
  goal: 'Differentiate composite functions',
  rationale: 'Limits first, because derivatives are built from them.',
  topics: [
    { id: 'limits', name: 'Limits', objectives: ['Evaluate simple limits'] },
    {
      id: 'derivatives',
      name: 'Derivatives',
      objectives: ['Apply the power rule'],
      prerequisites: ['limits'],
    },
  ],
};

test('a tutoring session runs intake, plan, teaching and a chapter break through one pathway', async () => {
  const s = session();

  // ---- Turn 1, intake: the tutor proposes a plan; the card ends the turn.
  const first = await s.turn('I want to learn to differentiate composite functions.', (_, cb) =>
    reply(cb, 'Here is a plan to get you there.', [call('propose_plan', PLAN, 'call-plan')]),
  );
  assert.equal(first.requests.length, 1, 'a card ends the turn without another model call');
  const [intakeRequest] = first.requests;
  const intakeSystem = systemOf(intakeRequest);
  assert.ok(intakeSystem.startsWith(TUTOR_SYSTEM_PROMPT), 'the tutor prompt replaces the base');
  assert.ok(!intakeSystem.includes('You are a helpful assistant.'));
  assert.ok(intakeSystem.includes('Phase: intake'));
  assert.ok(toolNames(intakeRequest).includes('propose_plan'));
  assert.ok(toolNames(intakeRequest).includes('ask_intake'));
  assert.ok(!toolNames(intakeRequest).includes('give_quiz'), 'no quiz without a plan');

  const planMessage = first.message();
  assert.equal(planMessage.content, 'Here is a plan to get you there.');
  assert.equal(planMessage.tutorSeq, 0);
  assert.equal(planMessage.toolRounds?.[0]?.calls[0]?.name, 'propose_plan');
  assert.equal(s.tutor().state.phase, 'proposal');
  assert.equal(s.tutor().state.proposal?.messageId, planMessage.id);

  // ---- The learner approves on the card: a learner command, then a short message.
  const approved = await s.store
    .getState()
    .dispatchTutor(
      s.chatId,
      { by: 'learner', type: 'approve_plan', proposalId: s.tutor().state.proposal!.proposalId },
      { by: 'learner', messageId: planMessage.id },
    );
  assert.equal(approved.ok, true);
  assert.equal(s.tutor().state.currentNodeId, 'limits');

  // ---- Turn 2, teaching: evidence and completion in one round, then a closing line.
  const second = await s.turn('Approved the plan.', (round, cb) => {
    if (round === 1) {
      reply(cb, 'You have limits down: you applied them and saw why.', [
        call('record_evidence', { kind: 'applied', note: 'Evaluated a limit', weight: 0.7 }, 'c1'),
        call(
          'record_evidence',
          { kind: 'insight', note: 'Explained continuity', weight: 0.5 },
          'c2',
        ),
        call('complete_topic', { note: 'Solid on limits' }, 'c3'),
      ]);
      return;
    }
    reply(cb, 'That closes the chapter on limits.');
  });
  assert.equal(second.requests.length, 2);
  const [teachRequest, closingRequest] = second.requests;

  // What the tutor read: the state block, and the learner's approval as authoritative.
  const teachSystem = systemOf(teachRequest);
  assert.ok(teachSystem.includes('Phase: teaching'));
  assert.ok(teachSystem.includes('Current topic: Limits [limits]'));
  assert.ok(teachSystem.includes("Since the learner's last message"));
  assert.ok(teachSystem.includes('- Approved your plan proposal.'));
  assert.ok(toolNames(teachRequest).includes('give_quiz'));
  assert.ok(!toolNames(teachRequest).includes('ask_intake'));

  // Turn 1's round came back as a real tool call and result, not as text.
  assert.deepEqual(
    toolExchanges(teachRequest).map((x) => x.name),
    ['propose_plan'],
  );
  assert.equal(toolExchanges(teachRequest)[0].result.shown, 'plan_proposal');

  // All three calls ran, in order, each seeing the one before; none was lost.
  const results = toolExchanges(closingRequest).slice(-3);
  assert.deepEqual(
    results.map((x) => [x.name, x.result.ok]),
    [
      ['record_evidence', true],
      ['record_evidence', true],
      ['complete_topic', true],
    ],
  );
  assert.equal(results[0].result.mastery, 79);
  assert.equal(results[1].result.mastery, 90);
  assert.equal(results[2].result.phase, 'interlude');

  const teachMessage = second.message();
  assert.equal(
    teachMessage.content,
    'You have limits down: you applied them and saw why.\n\nThat closes the chapter on limits.',
  );
  const turnEvents = s.tutor().events.filter((e) => e.messageId === teachMessage.id);
  assert.deepEqual(
    turnEvents.map((e) => e.type),
    ['evidence_recorded', 'evidence_recorded', 'topic_completed'],
  );
  assert.equal(s.tutor().state.phase, 'interlude');
  assert.equal(teachMessage.tutorSeq, approved.ok ? approved.state.lastSeq : -1);

  // ---- Turn 3, the chapter break: the next request carries the interlude and every round.
  const third = await s.turn('What comes next?', (_, cb) =>
    reply(cb, 'Derivatives, whenever you are ready.'),
  );
  const [breakRequest] = third.requests;
  const breakSystem = systemOf(breakRequest);
  assert.ok(breakSystem.includes('Phase: interlude'));
  assert.ok(breakSystem.includes('Next in the plan: Derivatives [derivatives]'));
  assert.ok(!breakSystem.includes("Since the learner's last message"), 'nothing changed since');
  assert.ok(toolNames(breakRequest).includes('start_topic'));
  assert.ok(!toolNames(breakRequest).includes('give_quiz'));
  assert.deepEqual(
    toolExchanges(breakRequest).map((x) => x.name),
    ['propose_plan', 'record_evidence', 'record_evidence', 'complete_topic'],
  );
  // Replayed history never carries an answer key or a failed call's secrets.
  assert.ok(!JSON.stringify(breakRequest.messages).includes('"correct"'));
});

test('regenerating a tutor reply reruns the whole turn, so its card comes back as a card', async () => {
  const s = session();
  const first = await s.turn('Teach me calculus.', (_, cb) =>
    reply(cb, 'Here is a plan.', [call('propose_plan', PLAN, 'call-plan')]),
  );
  const replyId = first.message().id;
  const oldProposal = s.tutor().state.proposal!.proposalId;

  const again = await s.regenerateReply(replyId, (_, cb) =>
    reply(cb, 'A shorter plan.', [
      call('propose_plan', { ...PLAN, topics: PLAN.topics.slice(0, 1) }, 'call-plan-2'),
    ]),
  );

  assert.equal(again.requests.length, 1, 'the card still ends the turn');
  const [request] = again.requests;
  assert.ok(toolNames(request).includes('propose_plan'), 'the tools are offered again');
  const system = systemOf(request);
  assert.ok(system.startsWith(TUTOR_SYSTEM_PROMPT), 'a fresh composition, not the old snapshot');
  assert.ok(system.includes('Phase: intake'), 'composed after the old proposal was retracted');
  assert.equal(
    request.messages.filter((m) => m.role === 'assistant').length,
    0,
    'the reply being replaced is not in its own history',
  );

  const message = again.message();
  assert.equal(message.id, replyId);
  assert.equal(message.content, 'A shorter plan.');
  assert.equal(message.toolRounds?.[0]?.calls[0]?.name, 'propose_plan');
  const proposal = s.tutor().state.proposal!;
  assert.notEqual(proposal.proposalId, oldProposal);
  assert.equal(proposal.messageId, replyId);
  assert.deepEqual(
    proposal.plan.nodes.map((n) => n.id),
    ['limits'],
  );
});
