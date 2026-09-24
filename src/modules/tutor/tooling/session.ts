// Module: tutor tooling session
// Responsibility: one tutor chat driven headlessly through the app's own turn pipeline
// (store, compose, agent loop, tool registry, engine) with the in-memory database, plus
// the learner's side: card commands through `dispatchTutor` and the messages the UI sends.

import type { StoreApi } from 'zustand/vanilla';
import { composeTurn } from '@/lib/agent/compose';
import { createTurnLifecycle } from '@/lib/agent/orchestrator/lifecycle';
import { runTurn } from '@/lib/agent/orchestrator/turn';
import { planTurn } from '@/lib/agent/planning';
import { streamFinal } from '@/lib/agent/streaming';
import {
  createPipelineClient,
  getStreamChatCompletion,
  type PipelineClient,
} from '@/lib/agent/pipelineClient';
import type { TransportAuth } from '@/lib/auth/transport';
import { repository } from '@/lib/db';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import { appendMessagesToChat, getMessagesForChat } from '@/lib/messages/indexing';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import { createModelIndex } from '@/lib/models';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import type { StoreState } from '@/lib/store/types';
import type { ModelMessage } from '@/lib/transport/contracts';
import type { TransportStreamParams } from '@/lib/transport/types';
import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import type { LearnerCommand, TutorEvent } from '@/modules/tutor/engine';
import {
  EMPTY_TUTOR_SESSION,
  type TutorDispatchResult,
  type TutorSession,
} from '@/modules/tutor/store/tutorSlice';
import { createHeadlessStore } from '@/modules/tutor/tooling/store';

/** Distributes Omit over the command union: a learner command without its actor. */
type WithoutBy<T> = T extends unknown ? Omit<T, 'by'> : never;
export type LearnerAction = WithoutBy<LearnerCommand>;

/** What the harness keeps of one request the tutor model received. */
export type RequestRecord = {
  round: number;
  model: string;
  toolChoice?: TransportStreamParams['toolChoice'];
  tools: string[];
  /** The state block the engine rendered into the system prompt, if it is there. */
  stateBlock?: string;
  /** Replayed tool calls from earlier turns that still carry an answer key. */
  answerKeyLeaks: number;
  messageCount: number;
};

export type TurnRecord = {
  user: Message;
  assistant: Message;
  requests: RequestRecord[];
  /** Tool results the loop answered for calls it did not run. */
  droppedCalls: string[];
  /** Events appended while the turn ran (the tutor's, and nothing else). */
  events: TutorEvent[];
  error?: string;
};

export type HeadlessTutorSessionOptions = {
  chat: Chat;
  models: ModelDescriptor[];
  resolveAuth: (modelId: string) => TransportAuth;
  /** Replaces the network; tests script the tutor model here. */
  pipeline?: PipelineClient;
};

const STATE_BLOCK_START = 'Tutor state\n';
const NOT_RUN_MARKER = 'This call was not run.';

function textOf(content: ModelMessage['content'] | undefined): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => ('text' in block && typeof block.text === 'string' ? block.text : ''))
    .join('\n\n');
}

/** Everything before the newest user message is replayed history. */
function replayedHistory(messages: ModelMessage[]): ModelMessage[] {
  let lastUser = -1;
  messages.forEach((m, i) => {
    if (m.role === 'user') lastUser = i;
  });
  return lastUser < 0 ? [] : messages.slice(0, lastUser);
}

function countAnswerKeys(messages: ModelMessage[]): number {
  let leaks = 0;
  for (const message of replayedHistory(messages)) {
    if (message.role !== 'assistant' || !message.tool_calls) continue;
    for (const call of message.tool_calls) {
      if (/"correct"\s*:/.test(call.function.arguments ?? '')) leaks += 1;
    }
  }
  return leaks;
}

function recordRequest(params: TransportStreamParams, round: number): RequestRecord {
  const system = textOf(params.messages.find((m) => m.role === 'system')?.content);
  const at = system.indexOf(STATE_BLOCK_START);
  return {
    round,
    model: params.model,
    ...(params.toolChoice ? { toolChoice: params.toolChoice } : {}),
    tools: (params.tools ?? []).map((tool) => tool.function.name),
    ...(at >= 0 ? { stateBlock: system.slice(at).trim() } : {}),
    answerKeyLeaks: countAnswerKeys(params.messages),
    messageCount: params.messages.length,
  };
}

/** Calls of the previous round the loop answered without running. */
function droppedIn(params: TransportStreamParams): string[] {
  const names: string[] = [];
  const messages = params.messages;
  for (let i = messages.length - 1; i >= 0 && messages[i].role === 'tool'; i -= 1) {
    const message = messages[i];
    if (message.role === 'tool' && textOf(message.content).includes(NOT_RUN_MARKER)) {
      names.push(message.name ?? 'unknown');
    }
  }
  return names;
}

export class HeadlessTutorSession {
  readonly chatId: string;
  readonly store: StoreApi<StoreState>;
  private readonly pipeline: PipelineClient;
  private readonly resolveAuth: (modelId: string) => TransportAuth;
  private readonly persistMessage = createMessagePersister(repository);
  private requests: RequestRecord[] = [];
  private dropped: string[] = [];
  private clock = Date.now();

  constructor(options: HeadlessTutorSessionOptions) {
    this.chatId = options.chat.id;
    this.resolveAuth = options.resolveAuth;
    this.store = createHeadlessStore({
      chat: options.chat,
      models: options.models,
      modelIndex: createModelIndex(options.models),
    });
    const stream = getStreamChatCompletion(options.pipeline);
    this.pipeline = createPipelineClient({
      ...(options.pipeline ? { chatCompletion: options.pipeline.chatCompletion } : {}),
      streamChatCompletion: (params) => {
        this.dropped.push(...droppedIn(params));
        this.requests.push(recordRequest(params, this.requests.length + 1));
        return stream(params);
      },
    });
  }

  get chat(): Chat {
    const chat = this.store.getState().chats.find((c) => c.id === this.chatId);
    if (!chat) throw new Error('The headless chat is missing from the store');
    return chat;
  }

  messages(): Message[] {
    return getMessagesForChat(this.store.getState(), this.chatId);
  }

  tutor(): TutorSession {
    return this.store.getState().tutorSessions[this.chatId] ?? EMPTY_TUTOR_SESSION;
  }

  /** A learner command, exactly as a card or the Hub dispatches it. */
  learner(action: LearnerAction, messageId?: string): Promise<TutorDispatchResult> {
    return this.store
      .getState()
      .dispatchTutor(this.chatId, { ...action, by: 'learner' } as LearnerCommand, {
        by: 'learner',
        ...(messageId ? { messageId } : {}),
      });
  }

  /** Sends a user message and runs the tutor's turn to its end, as the composer would. */
  async runTurn(content: string, metadata?: Message['metadata']): Promise<TurnRecord> {
    await this.store.getState().ensureTutorSession(this.chatId);
    const chat = this.chat;
    const modelId = chat.settings.modelId;
    const priorMessages = this.messages();
    const seqBefore = this.tutor().state.lastSeq;
    this.requests = [];
    this.dropped = [];

    const user = createUserMessage({
      chatId: this.chatId,
      content,
      createdAt: (this.clock += 1),
      ...(metadata ? { metadata } : {}),
    });
    const assistant = createAssistantMessage({
      chatId: this.chatId,
      content: '',
      createdAt: (this.clock += 1),
      model: modelId,
    });
    this.store.setState((s) => appendMessagesToChat(s, this.chatId, [user, assistant]));
    await this.persistMessage(user);
    await this.persistMessage(assistant);

    const { setState: set, getState: get } = this.store;
    const lifecycle = createTurnLifecycle({
      chatId: this.chatId,
      assistantMessageId: assistant.id,
      isPrimary: true,
      priorMessages,
      getChatForTurn: () => this.chat,
      set,
      get,
      updateMessage: (patch) =>
        set(
          (s) => updateMessageById(s, this.chatId, assistant.id, (m) => ({ ...m, ...patch })) ?? {},
        ),
    });

    let error: string | undefined;
    try {
      await runTurn({
        chat,
        chatId: this.chatId,
        modelId,
        userContent: content,
        assistantMessage: assistant,
        priorMessages,
        ui: get().ui,
        settings: resolveTurnSettings({
          chat,
          ui: get().ui,
          modelIndex: get().modelIndex,
          modelId,
        }),
        controller: new AbortController(),
        baseTurnContext: {
          set,
          get,
          models: get().models,
          modelIndex: get().modelIndex,
          persistMessage: this.persistMessage,
        },
        compose: composeTurn,
        plan: (options) => planTurn({ ...options, pipeline: this.pipeline }),
        streamFinal: (options) => streamFinal({ ...options, pipeline: this.pipeline }),
        authResolver: this.resolveAuth,
        hooks: lifecycle.hooks,
        pipeline: this.pipeline,
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    const final = get().messagesById[assistant.id] ?? assistant;
    return {
      user,
      assistant: final,
      requests: this.requests,
      droppedCalls: this.dropped,
      events: this.tutor().events.filter((e) => e.seq > seqBefore),
      ...(error ? { error } : {}),
    };
  }
}
