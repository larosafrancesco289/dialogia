// Module: tutor store slice
// Responsibility: the tutor's only state (one folded event log per chat) and its only
// mutation path, `dispatchTutor`. Learner clicks and tutor tool calls both come through here.

import { v4 as uuidv4 } from 'uuid';
import type { StoreSetter, StoreState } from '@/lib/store/types';
import type { Message } from '@/lib/types';
import { repository, TutorLogConflictError } from '@/lib/db';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/store/notify';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { readNextOverrides } from '@/lib/ui/next';
import {
  branchEvents,
  emptyTutorState,
  fold,
  parseTutorEvent,
  resolveTutorFlags,
  retractReply,
  step,
  type StepResult,
  type TutorCommand,
  type TutorError,
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
  /**
   * A chat was branched: the branch inherits the log up to the branch point,
   * re-addressed to its own chat and message ids (see `branchEvents`).
   */
  branchTutorSession: (
    sourceChatId: string,
    chatId: string,
    messageIds: Record<string, string>,
  ) => Promise<void>;
  /**
   * Another tab changed the chat's stored log: a session in memory takes it,
   * after its own queued changes. A chat never loaded here loads on demand.
   */
  refreshTutorSession: (chatId: string) => Promise<void>;
  /**
   * Forgets a deleted chat's session. Its stored events go with the chat; a
   * dispatch still in flight for it writes nothing more.
   */
  dropTutorSession: (chatId: string) => void;
  /**
   * Forgets every session and anything queued for one (the database was
   * replaced by an imported backup); each chat's log loads again on demand.
   */
  resetTutorSessions: () => void;
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

/** Shown when a retry of an unsaved write fails too: the change holds only in this tab. */
export const TUTOR_SAVE_FAILED_NOTICE =
  'Tutor progress could not be saved. It holds in this tab and will be retried with the next change.';

const GONE: TutorError = {
  code: 'chat_deleted',
  message: 'This chat was deleted or replaced, so the tutor can no longer change it.',
  hint: 'Stop calling tutor tools in this turn.',
};

const CONFLICT: TutorError = {
  code: 'log_conflict',
  message: 'The tutor record changed in another tab while this change was being saved.',
  hint: 'Read the current state and try again if the change still applies.',
};

const loadedSession = (events: TutorEvent[]): TutorSession => ({
  events,
  state: fold(events),
  loaded: true,
});

export function createTutorSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
): TutorSliceState & TutorStoreActions {
  const loads = new Map<string, Promise<TutorSession>>();
  const queues = new Map<string, Promise<unknown>>();
  /**
   * Events a chat holds in memory that have not reached the database yet, in
   * log order. The next write for the chat sends them again first (a put by id
   * is idempotent), so a failed write never leaves a hole on disk under later
   * events.
   */
  const unsaved = new Map<string, TutorEvent[]>();
  const failures = new Map<string, number>();
  /** Chats deleted in this session: nothing more is loaded or written for them. */
  const dropped = new Set<string>();
  /**
   * Bumped when every session is forgotten (a backup was imported), so work
   * begun before that lands nowhere.
   */
  let epoch = 0;
  const live = (chatId: string, since: number) => since === epoch && !dropped.has(chatId);

  const publish = (chatId: string, session: TutorSession) =>
    set((s) => ({ tutorSessions: { ...s.tutorSessions, [chatId]: session } }));

  /** The chat's stored log, and how many rows it had before malformed ones were dropped. */
  const readLog = async (chatId: string): Promise<{ events: TutorEvent[]; stored: number }> => {
    const records = await repository.loadTutorEvents(chatId);
    const events = records
      .map(parseTutorEvent)
      .filter((event): event is TutorEvent => !!event && event.chatId === chatId);
    if (records.length > events.length) {
      logger.warn(`Dropped ${records.length - events.length} malformed tutor events for a chat`);
    }
    return { events, stored: records.length };
  };

  /**
   * Sends the chat's unsaved events and then `events` to the database.
   * 'conflict': another tab took one of the positions, and nothing was
   * written. 'unsaved': the write failed and the batch waits for the next one.
   */
  const write = async (
    chatId: string,
    events: TutorEvent[],
  ): Promise<'saved' | 'conflict' | 'unsaved'> => {
    const batch = [...(unsaved.get(chatId) ?? []), ...events];
    if (!batch.length) return 'saved';
    try {
      await repository.appendTutorEvents(batch);
      unsaved.delete(chatId);
      failures.delete(chatId);
      return 'saved';
    } catch (error) {
      if (error instanceof TutorLogConflictError) return 'conflict';
      // The change stands for this session; say so rather than pretend it failed.
      logger.error('Tutor events could not be saved', error);
      unsaved.set(chatId, batch);
      const count = (failures.get(chatId) ?? 0) + 1;
      failures.set(chatId, count);
      if (count === 2) notify(get, TUTOR_SAVE_FAILED_NOTICE);
      return 'unsaved';
    }
  };

  /** The chat's log as the database has it, replacing memory (and anything unsaved). */
  const reload = async (chatId: string): Promise<TutorSession> => {
    if (unsaved.has(chatId)) {
      logger.warn('Tutor events lost to a write from another tab');
    }
    unsaved.delete(chatId);
    failures.delete(chatId);
    const session = loadedSession((await readLog(chatId)).events);
    publish(chatId, session);
    return session;
  };

  const load = async (chatId: string): Promise<TutorSession> => {
    const since = epoch;
    const stored = await readLog(chatId);
    let events = stored.events;

    // A chat whose log is empty may still hold tutor data from before the
    // log existed. Read it once; from now on the log is the only record.
    const chat = get().chats.find((c) => c.id === chatId);
    if (!stored.stored && chat) {
      const imported = buildLegacyImport({
        chat,
        messages: await legacyMessages(get(), chatId),
        at: Date.now(),
        newId: uuidv4,
      });
      if (imported.length && live(chatId, since)) {
        try {
          // Written only if the log is still empty: another tab may have imported it meanwhile.
          events = (await repository.seedTutorEvents(chatId, imported))
            ? imported
            : (await readLog(chatId)).events;
        } catch (error) {
          logger.error('Tutor events could not be saved', error);
          events = imported;
          unsaved.set(chatId, imported);
        }
      }
    }

    const session = loadedSession(events);
    if (live(chatId, since)) publish(chatId, session);
    return session;
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

  const flush = async (chatId: string) => {
    const since = epoch;
    if (!unsaved.has(chatId) || !live(chatId, since)) return;
    if ((await write(chatId, [])) === 'conflict' && live(chatId, since)) await reload(chatId);
  };

  const ensureTutorSession = (chatId: string): Promise<TutorSession> => {
    if (dropped.has(chatId)) return Promise.resolve(loadedSession([]));
    const existing = get().tutorSessions[chatId];
    if (existing?.loaded) {
      // Retry a failed write now rather than wait for the next change.
      if (unsaved.has(chatId)) void serialize(chatId, () => flush(chatId));
      return Promise.resolve(existing);
    }
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
    retried = false,
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
    const since = epoch;
    await ensureTutorSession(chatId);
    if (!live(chatId, since)) return { ok: false, error: GONE };
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
    // Accepted, and nothing to change (the tutor started a topic already in progress).
    if (!result.events.length) return { ...result, before: session.state };

    publish(chatId, {
      events: [...session.events, ...result.events],
      state: result.state,
      loaded: true,
    });
    if ((await write(chatId, result.events)) === 'conflict') {
      // Another tab appended first. Its events are the log now: decide again against them, once.
      if (!live(chatId, since)) return { ok: false, error: GONE };
      await reload(chatId);
      if (retried) return { ok: false, error: CONFLICT };
      return decideAndAppend(chatId, command, meta, true);
    }
    return { ...result, before: session.state };
  };

  const retract = async (chatId: string, messageId: string, retried = false): Promise<boolean> => {
    const since = epoch;
    await ensureTutorSession(chatId);
    if (!live(chatId, since)) return false;
    const session = get().tutorSessions[chatId] ?? EMPTY_TUTOR_SESSION;
    const event = retractReply(session.events, messageId, {
      chatId,
      at: Date.now(),
      id: uuidv4(),
    });
    if (!event) return false;
    // A retraction reaches back, so the state is refolded rather than stepped.
    publish(chatId, loadedSession([...session.events, event]));
    if ((await write(chatId, [event])) === 'conflict') {
      if (!live(chatId, since)) return false;
      await reload(chatId);
      return retried ? false : retract(chatId, messageId, true);
    }
    return true;
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

    refreshTutorSession(chatId) {
      return serialize(chatId, async () => {
        const since = epoch;
        await loads.get(chatId)?.catch(() => undefined);
        if (!live(chatId, since) || !get().tutorSessions[chatId]?.loaded) return;
        // This tab's unsaved events go first; on a conflict that reloads anyway.
        await flush(chatId);
        if (!live(chatId, since) || unsaved.has(chatId)) return;
        const { events } = await readLog(chatId);
        const held = get().tutorSessions[chatId]?.events ?? [];
        const same =
          held.length === events.length && held.every((event, i) => event.id === events[i].id);
        if (!same && live(chatId, since)) publish(chatId, loadedSession(events));
      });
    },

    async branchTutorSession(sourceChatId, chatId, messageIds) {
      // Behind the source's queued changes, so a tool call still landing is included or not, never half.
      const source = await serialize(sourceChatId, () => ensureTutorSession(sourceChatId));
      const messages = getMessagesForChat(get(), sourceChatId);
      const copiedAt = messages.findIndex((m) => !(m.id in messageIds));
      const later = copiedAt < 0 ? [] : messages.slice(copiedAt);
      const seenSeq = messages
        .filter((m) => m.id in messageIds && typeof m.tutorSeq === 'number')
        .reduce((max, m) => Math.max(max, m.tutorSeq as number), 0);
      const events = branchEvents(source.events, {
        chatId,
        copied: messageIds,
        later: new Set(later.map((m) => m.id)),
        seenSeq,
        newId: uuidv4,
      });
      // Even an empty share is the branch's whole log: it must never import
      // legacy data from the chat settings and messages it copied.
      if (events.length) await write(chatId, events);
      publish(chatId, loadedSession(events));
    },

    dropTutorSession(chatId) {
      dropped.add(chatId);
      // A write already on its way may land after the chat's rows were deleted:
      // once it has, sweep whatever it left.
      const inflight = [queues.get(chatId), loads.get(chatId)].filter((p) => !!p);
      if (inflight.length) {
        void Promise.allSettled(inflight)
          .then(() => repository.deleteTutorEvents(chatId))
          .catch((error) => logger.warn('Tutor events of a deleted chat were not swept', error));
      }
      loads.delete(chatId);
      queues.delete(chatId);
      unsaved.delete(chatId);
      failures.delete(chatId);
      if (!(chatId in get().tutorSessions)) return;
      set((s) => {
        const { [chatId]: _dropped, ...rest } = s.tutorSessions;
        return { tutorSessions: rest };
      });
    },

    resetTutorSessions() {
      epoch += 1;
      loads.clear();
      queues.clear();
      unsaved.clear();
      failures.clear();
      dropped.clear();
      set(() => ({ tutorSessions: {} }));
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
