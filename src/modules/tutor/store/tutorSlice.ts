// Module: tutor store slice
// Responsibility: the tutor's only state (one folded event log per chat) and its only
// mutation path, `dispatchTutor`. Learner clicks and tutor tool calls both come through here.

import { v4 as uuidv4 } from 'uuid';
import type { StoreSetter, StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { repository } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { readNextOverrides } from '@/lib/ui/next';
import {
  emptyTutorState,
  fold,
  parseTutorEvent,
  resolveTutorFlags,
  retractReply,
  step,
  type StepResult,
  type TutorCommand,
  type TutorEvent,
  type TutorState,
} from '@/modules/tutor/engine';
import { buildLegacyImport } from '@/modules/tutor/store/legacyImport';
import {
  buildPlanWelcomeMessage,
  prepareTutorWelcomeMessage as prepareTutorWelcomeMessageService,
} from '@/modules/tutor/services/tutorWelcome';

export type TutorSession = {
  /** The chat's log in seq order. */
  events: TutorEvent[];
  /** Always `fold(events)`. */
  state: TutorState;
  /** False only for the placeholder a chat has before its first load. */
  loaded: boolean;
};

export type TutorDispatchMeta = {
  by: 'tutor' | 'learner';
  /** The assistant message the events belong to: the turn's reply, or the card acted on. */
  messageId?: string;
};

/** The engine's step result; on success also the state the command was decided against. */
export type TutorDispatchResult =
  | (Extract<StepResult, { ok: true }> & { before: TutorState })
  | Extract<StepResult, { ok: false }>;

export type TutorSliceState = {
  tutorSessions: Record<string, TutorSession>;
};

export type TutorStoreActions = {
  /** Loads a chat's log once (importing legacy data on the first load of an empty log). */
  ensureTutorSession: (chatId: string) => Promise<TutorSession>;
  /**
   * The one way tutor state changes. Decides the command against the chat's
   * current state, appends the events in memory, then persists them. Calls
   * for one chat run one after another, so none can decide against a state
   * another is about to change.
   */
  dispatchTutor: (
    chatId: string,
    command: TutorCommand,
    meta: TutorDispatchMeta,
  ) => Promise<TutorDispatchResult>;
  /**
   * An assistant reply is being replaced or removed: what its turn did, and
   * the learner's answers to its cards, stop counting. Serialized with
   * dispatches. Resolves false when nothing belonged to it.
   */
  retractTutorReply: (chatId: string, messageId: string) => Promise<boolean>;
  /** Forgets a deleted chat's session. Its stored events go with the chat. */
  dropTutorSession: (chatId: string) => void;
  primeTutorWelcomePreview: () => Promise<string | undefined>;
  prepareTutorWelcomeMessage: (chatId?: string) => Promise<string | undefined>;
};

declare module '@/lib/store/stateTypes' {
  interface ModuleStoreState extends TutorSliceState {}
  interface ModuleStoreActions extends TutorStoreActions {}
}

export const EMPTY_TUTOR_SESSION: TutorSession = {
  events: [],
  state: emptyTutorState(),
  loaded: false,
};

/** The chat's messages from the database, with anything newer already in memory on top. */
async function legacyMessages(state: StoreState, chatId: string): Promise<Message[]> {
  const byId = new Map<string, Message>();
  try {
    for (const message of await repository.loadMessagesForChat(chatId)) {
      byId.set(message.id, message);
    }
  } catch (error) {
    logger.warn('Tutor legacy import could not read stored messages', error);
  }
  for (const message of getMessagesForChat(state, chatId)) byId.set(message.id, message);
  return [...byId.values()];
}

export function createTutorSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
): TutorSliceState & TutorStoreActions {
  const loads = new Map<string, Promise<TutorSession>>();
  const queues = new Map<string, Promise<unknown>>();

  const publish = (chatId: string, session: TutorSession) =>
    set((s) => ({ tutorSessions: { ...s.tutorSessions, [chatId]: session } }));

  const load = async (chatId: string): Promise<TutorSession> => {
    const records = await repository.loadTutorEvents(chatId);
    let events = records
      .map(parseTutorEvent)
      .filter((event): event is TutorEvent => !!event && event.chatId === chatId);
    if (records.length > events.length) {
      logger.warn(`Dropped ${records.length - events.length} malformed tutor events for a chat`);
    }

    // A chat whose log is empty may still hold tutor data from before the
    // log existed. Read it once; from now on the log is the only record.
    const chat = get().chats.find((c) => c.id === chatId);
    if (!records.length && chat) {
      const imported = buildLegacyImport({
        chat,
        messages: await legacyMessages(get(), chatId),
        at: Date.now(),
        newId: uuidv4,
      });
      if (imported.length) {
        await repository.appendTutorEvents(imported);
        events = imported;
      }
    }

    const session: TutorSession = { events, state: fold(events), loaded: true };
    publish(chatId, session);
    return session;
  };

  const ensureTutorSession = (chatId: string): Promise<TutorSession> => {
    const existing = get().tutorSessions[chatId];
    if (existing?.loaded) return Promise.resolve(existing);
    let pending = loads.get(chatId);
    if (!pending) {
      pending = load(chatId).finally(() => loads.delete(chatId));
      loads.set(chatId, pending);
    }
    return pending;
  };

  const decideAndAppend = async (
    chatId: string,
    command: TutorCommand,
    meta: TutorDispatchMeta,
  ): Promise<TutorDispatchResult> => {
    if (command.by !== meta.by) {
      return {
        ok: false,
        error: {
          code: 'invalid_arguments',
          message: `A ${command.by} command cannot be dispatched as the ${meta.by}.`,
          hint: 'Dispatch the command with a matching actor.',
        },
      };
    }
    await ensureTutorSession(chatId);
    const session = get().tutorSessions[chatId] ?? EMPTY_TUTOR_SESSION;
    const chat = get().chats.find((c) => c.id === chatId);
    const result = step(session.state, command, {
      chatId,
      at: Date.now(),
      idFactory: uuidv4,
      flags: resolveTutorFlags(chat?.settings.features.tutor),
      ...(meta.messageId ? { messageId: meta.messageId } : {}),
    });
    if (!result.ok) return result;

    publish(chatId, {
      events: [...session.events, ...result.events],
      state: result.state,
      loaded: true,
    });
    try {
      await repository.appendTutorEvents(result.events);
    } catch (error) {
      // The change stands for this session; say so rather than pretend it failed.
      logger.error('Tutor events could not be saved', error);
    }
    return { ...result, before: session.state };
  };

  const retract = async (chatId: string, messageId: string): Promise<boolean> => {
    await ensureTutorSession(chatId);
    const session = get().tutorSessions[chatId] ?? EMPTY_TUTOR_SESSION;
    const event = retractReply(session.events, messageId, {
      chatId,
      at: Date.now(),
      id: uuidv4(),
    });
    if (!event) return false;
    const events = [...session.events, event];
    // A retraction reaches back, so the state is refolded rather than stepped.
    publish(chatId, { events, state: fold(events), loaded: true });
    try {
      await repository.appendTutorEvents([event]);
    } catch (error) {
      logger.error('Tutor events could not be saved', error);
    }
    return true;
  };

  /** Runs one change for a chat after every change queued before it. */
  const serialize = <T>(chatId: string, task: () => Promise<T>): Promise<T> => {
    const previous = queues.get(chatId) ?? Promise.resolve();
    const run = previous.then(task);
    queues.set(
      chatId,
      run.catch(() => undefined),
    );
    return run;
  };

  return {
    tutorSessions: {},

    ensureTutorSession,

    dispatchTutor(chatId, command, meta) {
      return serialize(chatId, () => decideAndAppend(chatId, command, meta));
    },

    retractTutorReply(chatId, messageId) {
      return serialize(chatId, () => retract(chatId, messageId));
    },

    dropTutorSession(chatId) {
      loads.delete(chatId);
      queues.delete(chatId);
      if (!(chatId in get().tutorSessions)) return;
      set((s) => {
        const { [chatId]: _dropped, ...rest } = s.tutorSessions;
        return { tutorSessions: rest };
      });
    },

    async primeTutorWelcomePreview() {
      const state = get();
      const nextOverrides = readNextOverrides(state.ui);
      const tutorActive =
        !!state.ui.flags.experimentalTutor &&
        (state.ui.tutor?.forceMode || nextOverrides.tutorMode);
      if (!tutorActive) {
        set((s) => ({
          ui: { ...s.ui, tutor: { ...s.ui.tutor, welcomePreview: { status: 'idle' } } },
        }));
        return undefined;
      }
      const plan = state.selectedChatId
        ? state.tutorSessions[state.selectedChatId]?.state.plan
        : undefined;
      const message = buildPlanWelcomeMessage(plan);
      set((s) => ({
        ui: {
          ...s.ui,
          tutor: {
            ...s.ui.tutor,
            welcomePreview: { status: 'ready', message, generatedAt: Date.now() },
          },
        },
      }));
      return message;
    },

    async prepareTutorWelcomeMessage(chatId?: string) {
      const id = chatId || get().selectedChatId;
      if (!id) return undefined;
      return prepareTutorWelcomeMessageService({ chatId: id, set, get, repository });
    },
  };
}
