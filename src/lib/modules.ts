// Module: modules
// Responsibility: The single list of enabled feature modules and the only place core
// is allowed to reach into one. Removing a module means deleting its directory and
// its entry here.

import type { UiSnapshot } from '@/lib/contracts/ui';
import type { ToolGate } from '@/lib/agent/planning/types';
import type { PersistFragment, StoreGetter, StoreSetter } from '@/lib/store/stateTypes';
import type { Chat, LearningPlan, Message } from '@/lib/types';
import { registerCoreTools } from '@/lib/tools/core/searchTools';
import { createTutorSlice } from '@/lib/store/tutorSlice';
import {
  buildTutorPlanningContribution,
  registerTutorTools,
} from '@/lib/agent/tools/tutor/moduleEntry';

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

export type AppModule = {
  id: string;
  registerTools?(): void;
  /** Contributes gating and per-turn context when the module is active for this turn. */
  planning?(args: ModulePlanningArgs): ModulePlanningContribution | undefined;
  /** Contributes state and actions to the composed store. */
  storeSlice?(
    set: StoreSetter,
    get: StoreGetter,
    store?: unknown,
  ): Record<string, unknown> | undefined;
  /** Contributes the module's own slice of the persisted blob. */
  persistFragment?: PersistFragment;
};

const coreModule: AppModule = {
  id: 'core',
  registerTools: registerCoreTools,
};

const tutorModule: AppModule = {
  id: 'tutor',
  registerTools: registerTutorTools,
  planning: buildTutorPlanningContribution,
  storeSlice: (set, get, store) => createTutorSlice(set, get, store),
};

export const ENABLED_MODULES: AppModule[] = [coreModule, tutorModule];

let registered = false;

/**
 * Registers every enabled module's tools. Idempotent; `@/lib/tools` calls it, so
 * anything importing that barrel sees a populated registry.
 */
export function registerEnabledModules(modules: AppModule[] = ENABLED_MODULES): void {
  if (modules === ENABLED_MODULES) {
    if (registered) return;
    registered = true;
  }
  for (const appModule of modules) appModule.registerTools?.();
}
