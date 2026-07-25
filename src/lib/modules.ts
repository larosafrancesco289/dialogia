// Module: modules
// Responsibility: The single list of enabled feature modules and the only place core
// is allowed to reach into one. Removing a module means deleting its directory and
// its entry here.

import type { UiSnapshot } from '@/lib/contracts/ui';
import type { ToolDefinition } from '@/lib/transport/contracts';
import type { ResolvedTurnSettings } from '@/lib/settings/resolve';
import type { ToolGate } from '@/lib/agent/planning/types';
import type { PersistFragment, StoreGetter, StoreSetter } from '@/lib/store/stateTypes';
import type { Chat, LearningPlan, Message } from '@/lib/types';
import { registerCoreTools } from '@/lib/tools/core/searchTools';
import { createTutorSlice } from '@/modules/tutor/store/tutorSlice';
import { buildTutorComposeContribution } from '@/modules/tutor/agent/compose';
import {
  buildTutorPlanningContribution,
  registerTutorTools,
} from '@/modules/tutor/tools/moduleEntry';

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

export type AppModule = {
  id: string;
  registerTools?(): void;
  /** Contributes tools and system preambles to a turn's request payload. */
  compose?(args: ModuleComposeArgs): Promise<ModuleComposeContribution | undefined>;
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
  compose: buildTutorComposeContribution,
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
