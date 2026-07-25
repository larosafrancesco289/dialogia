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
import type { PersistFragment, StoreGetter, StoreSetter } from '@/lib/store/stateTypes';
import type { ModuleSettingsDefaults, ModuleSettingsPhase } from '@/lib/settings/moduleDefaults';
import type { Chat, LearningPlan, Message } from '@/lib/types';
import { createTutorSlice } from '@/modules/tutor/store/tutorSlice';
import { decorateTutorMessage } from '@/modules/tutor/lib/hiddenContent';
import { tutorSettingsDefaults } from '@/modules/tutor/lib/defaults';

export type ModulePlanningArgs = {
  chat: Chat;
  messagesForChat: Message[];
  ui?: UiSnapshot;
  currentPlan?: LearningPlan;
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
};

export type ModuleComposeContribution = {
  tools?: ToolDefinition[];
  stablePreambles?: string[];
  dynamicPreambles?: string[];
  /** The module needs the turn to run the multi-round planning loop. */
  requiresPlanning?: boolean;
  /** The module's preamble is a complete system prompt; suppress the base one. */
  replacesBaseSystem?: boolean;
};

/** A module's turn-time half. Loaded on demand, never at boot. */
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
  decorateMessage: decorateTutorMessage,
  settingsDefaults: tutorSettingsDefaults,
  load: async () => (await import('@/modules/tutor/moduleEntry')).tutorRuntime,
};

export const ENABLED_MODULES: AppModule[] = [coreModule, tutorModule];

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
    ).then((runtimes) => {
      for (const runtime of runtimes) runtime.registerTools?.();
      loaded = runtimes;
      return runtimes;
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
