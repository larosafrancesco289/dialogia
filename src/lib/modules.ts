// Module: modules
// Responsibility: The single list of enabled feature modules and the only place core
// is allowed to reach into one. Removing a module means deleting its directory and
// its entry here.
//
// A module is split in two: the boot half (`storeSlice`, `persistFragment`) and the
// turn half (`load()`). Only the boot half may be imported statically — the turn
// half loads with the turn pipeline, which is what keeps it out of the first-load
// bundle. Do not turn `load` into a static import.

import type { UiSnapshot } from '@/lib/contracts/ui';
import type { ToolDefinition } from '@/lib/transport/contracts';
import type { ResolvedTurnSettings } from '@/lib/settings/resolve';
import type { ToolGate } from '@/lib/agent/planning/types';
import type { ModuleTurnEffects, TurnEffectsContext } from '@/lib/agent/orchestrator/turnEffects';
import type { PersistFragment, StoreGetter, StoreSetter, StoreState } from '@/lib/store/stateTypes';
import type { ModuleSettingsDefaults, ModuleSettingsPhase } from '@/lib/settings/moduleDefaults';
import type { ModulePanels } from '@/lib/ui/panels';
import type { TurnStore } from '@/lib/agent/contracts';
import type { Chat, Message } from '@/lib/types';
import { getMessagesForChat } from '@/lib/messages/indexing';
import { inLatestExchange } from '@/lib/messages/latestExchange';
import { createTutorSlice } from '@/modules/tutor/store/tutorSlice';
import { tutorSettingsDefaults } from '@/modules/tutor/lib/defaults';
import { tutorPanels } from '@/modules/tutor/panels';
import {
  hasTutorPlan,
  messageCarriesTutorCard,
  tutorFollowsTranscript,
} from '@/modules/tutor/store/selectors';

export type ModulePlanningArgs = {
  chat: Chat;
  messagesForChat: Message[];
  ui?: UiSnapshot;
};

export type ModulePlanningContribution = {
  gate: ToolGate;
  /** Keyed by module id; merged into `PlanningContext.moduleContext`. */
  moduleContext?: Record<string, unknown>;
};

export type ModuleComposeArgs = {
  chat: Chat;
  ui?: UiSnapshot;
  settings: ResolvedTurnSettings;
  priorMessages: Message[];
  /**
   * The turn's store. A module reads (and may first load) its own state here;
   * the composed store carries the module's slice even though this type names
   * only core fields.
   */
  store?: TurnStore;
};

export type ModuleComposeContribution = {
  tools?: ToolDefinition[];
  /**
   * The module's tools as they stand now. An agent-loop turn calls it after
   * each round's tool calls have run and offers the result in place of
   * `tools`, so what the model may call follows what those calls changed.
   */
  refreshTools?: () => ToolDefinition[];
  stablePreambles?: string[];
  dynamicPreambles?: string[];
  /** The module needs the turn to run the multi-round planning loop. */
  requiresPlanning?: boolean;
  /**
   * Run the turn as a visible agent loop: every round streams into the reply,
   * tool results go back to the model, and a handler can end the turn. See
   * `agent/streaming/agentLoop.ts`.
   */
  loop?: 'agent';
  /** The module's preamble is a complete system prompt; suppress the base one. */
  replacesBaseSystem?: boolean;
  /** Fields to set on the turn's assistant message once the turn is composed. */
  messagePatch?: Partial<Message>;
};

/** A module's turn-time half. Loaded on demand, never at boot. */
export type ChatBranch = {
  sourceChatId: string;
  chatId: string;
  /** Source message id to its copy's id, for every copied message. */
  messageIds: Record<string, string>;
};

export type ModuleRuntime = {
  /** Reacts to the turn's composition, plan result, and message. */
  turnEffects?(context: TurnEffectsContext): ModuleTurnEffects | undefined;
  registerTools?(): void;
  /** Contributes tools and system preambles to a turn's request payload. */
  compose?(args: ModuleComposeArgs): Promise<ModuleComposeContribution | undefined>;
  /** Contributes gating and per-turn context when the module is active for this turn. */
  planning?(args: ModulePlanningArgs): ModulePlanningContribution | undefined;
};

export type AppModule = {
  id: string;
  /** Contributes state and actions to the composed store. Boot half. */
  storeSlice?(
    set: StoreSetter,
    get: StoreGetter,
    store?: unknown,
  ): Record<string, unknown> | undefined;
  /** Contributes the module's own slice of the persisted blob. Boot half. */
  persistFragment?: PersistFragment;
  /** Derives fields on a message before it is stored or hydrated. Boot half. */
  decorateMessage?(message: Message): Message;
  /** Components the shell mounts into its typed UI slots. Boot half. */
  panels?: ModulePanels;
  /** Whether the module's `rightPanel` has something to show now. Boot half. */
  hasRightPanelContent?(state: StoreState): boolean;
  /** Warms whatever the module needs after the store has hydrated. Boot half. */
  onBootstrap?(store: { get: StoreGetter; set: StoreSetter }): Promise<void> | void;
  /** A chat was deleted; drop anything held for it in memory. Boot half. */
  onChatDeleted?(store: { get: StoreGetter }, chatId: string): void;
  /**
   * A chat was branched: the branch has copies of the source's messages up to
   * the branch point, under new ids. Whatever the module recorded for those
   * messages should come along. Core awaits this before the branch opens.
   * Boot half.
   */
  onChatBranched?(store: { get: StoreGetter }, branch: ChatBranch): Promise<void> | void;
  /**
   * An assistant reply is about to be replaced (regenerated, or rerun after an
   * edit): whatever the module recorded for it should stop counting. Core
   * awaits this before the new reply is composed. Boot half.
   */
  onReplyRetracted?(
    store: { get: StoreGetter },
    reply: { chatId: string; messageId: string },
  ): Promise<void> | void;
  /**
   * The module keeps a record of this chat that follows its transcript in
   * order, so a reply may be regenerated (or an edit rerun) only in the latest
   * exchange: redoing an earlier reply under later ones would leave the record
   * and the transcript disagreeing. Boot half.
   */
  latestExchangeOnly?(state: StoreState, chatId: string): boolean;
  /**
   * The module shows something of its own with this assistant message (a
   * card), so the reply is not empty even when it has no text. Boot half.
   */
  messageHasContent?(state: StoreState, message: Message): boolean;
  /** Fills in the module's own chat-settings block. Boot half. */
  settingsDefaults?(args: {
    chat: Pick<Chat, 'settings'>;
    ui?: UiSnapshot;
    phase: ModuleSettingsPhase;
  }): ModuleSettingsDefaults | undefined;
  /** Loads the turn half. Must stay a dynamic import. */
  load?(): Promise<ModuleRuntime>;
};

const coreModule: AppModule = {
  id: 'core',
  load: async () => {
    const { registerCoreTools } = await import('@/lib/tools/core/searchTools');
    return { registerTools: registerCoreTools };
  },
};

const tutorModule: AppModule = {
  id: 'tutor',
  storeSlice: (set, get, store) => createTutorSlice(set, get, store),
  settingsDefaults: tutorSettingsDefaults,
  panels: tutorPanels,
  hasRightPanelContent: hasTutorPlan,
  // Bootstrap also reruns after a backup import replaced the database.
  onBootstrap: ({ get }) => get().resetTutorSessions(),
  onChatDeleted: ({ get }, chatId) => get().dropTutorSession(chatId),
  onChatBranched: async ({ get }, { sourceChatId, chatId, messageIds }) => {
    await get().branchTutorSession(sourceChatId, chatId, messageIds);
  },
  onReplyRetracted: async ({ get }, { chatId, messageId }) => {
    await get().retractTutorReply(chatId, messageId);
  },
  latestExchangeOnly: tutorFollowsTranscript,
  messageHasContent: messageCarriesTutorCard,
  load: async () => (await import('@/modules/tutor/moduleEntry')).tutorRuntime,
};

export const ENABLED_MODULES: AppModule[] = [coreModule, tutorModule];

/** Whether any module's right panel has content for the current state. */
export function selectRightPanelContent(state: StoreState): boolean {
  return ENABLED_MODULES.some((appModule) => appModule.hasRightPanelContent?.(state) === true);
}

export function notifyChatDeleted(store: { get: StoreGetter }, chatId: string): void {
  for (const appModule of ENABLED_MODULES) {
    try {
      appModule.onChatDeleted?.(store, chatId);
    } catch {
      // One module's cleanup must not stop another's.
    }
  }
}

/** Every module's `onChatBranched`, awaited; a failing module never blocks the branch. */
export async function notifyChatBranched(
  store: { get: StoreGetter },
  branch: ChatBranch,
): Promise<void> {
  await Promise.allSettled(
    ENABLED_MODULES.map(async (appModule) => appModule.onChatBranched?.(store, branch)),
  );
}

/**
 * Whether a reply may be regenerated, or the user message before it edited and
 * rerun: always, unless a module keeps a record that follows this chat's
 * transcript, and then only in the latest exchange.
 */
export function canRedoReply(state: StoreState, chatId: string, messageId: string): boolean {
  return (
    !latestExchangeOnly(state, chatId) ||
    inLatestExchange(getMessagesForChat(state, chatId), messageId)
  );
}

/** Whether some module restricts this chat's regenerate and edit-and-rerun to its latest exchange. */
export function latestExchangeOnly(state: StoreState, chatId: string): boolean {
  return ENABLED_MODULES.some(
    (appModule) => appModule.latestExchangeOnly?.(state, chatId) === true,
  );
}

/** Whether some module shows content of its own with this message, text or not. */
export function messageHasModuleContent(state: StoreState, message: Message): boolean {
  return ENABLED_MODULES.some(
    (appModule) => appModule.messageHasContent?.(state, message) === true,
  );
}

/** Every module's `onReplyRetracted`, awaited; a failing module never blocks the new reply. */
export async function notifyReplyRetracted(
  store: { get: StoreGetter },
  reply: { chatId: string; messageId: string },
): Promise<void> {
  await Promise.allSettled(
    ENABLED_MODULES.map(async (appModule) => appModule.onReplyRetracted?.(store, reply)),
  );
}

let loading: Promise<ModuleRuntime[]> | undefined;
let loaded: ModuleRuntime[] = [];

/**
 * Loads every enabled module's turn half and registers its tools. Idempotent.
 * Called at the start of a turn (from `composeTurn`), so by the time anything
 * reads the tool registry or the planning gate, this has resolved.
 */
export function loadModuleRuntimes(): Promise<ModuleRuntime[]> {
  if (!loading) {
    loading = Promise.all(
      ENABLED_MODULES.map((m): Promise<ModuleRuntime> => m.load?.() ?? Promise.resolve({})),
    )
      .then((runtimes) => {
        for (const runtime of runtimes) runtime.registerTools?.();
        loaded = runtimes;
        return runtimes;
      })
      .catch((error) => {
        // A failed chunk load must not poison every later turn; clear the cached
        // promise so the next turn retries the import.
        loading = undefined;
        throw error;
      });
  }
  return loading;
}

/**
 * The runtimes loaded so far, for the synchronous call sites inside a turn.
 * Empty until `loadModuleRuntimes()` has resolved.
 */
export function loadedModuleRuntimes(): ModuleRuntime[] {
  return loaded;
}
