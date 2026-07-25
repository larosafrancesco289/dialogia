// Module: agent/orchestrator/turnEffects
// Responsibility: The seam through which modules react to a turn. Core drives the
// order (composition -> plan result -> stream) and owns the message patch it
// applies; modules decide what a turn means for their own persisted state.

import type { PlanTurnResult, StoreSetter, TurnComposition } from '@/lib/agent/types';
import type { Chat, Message } from '@/lib/types';
import { loadedModuleRuntimes, type ModuleRuntime } from '@/lib/modules';

export type TurnEffectsContext = {
  chatId: string;
  assistantMessageId: string;
  isPrimary: boolean;
  priorMessages: Message[];
  getChatForTurn: () => Chat;
  set: StoreSetter;
  updateChat?: (chat: Chat) => void;
  persistChat?: (chat: Chat) => Promise<void> | void;
};

export type ModuleTurnEffects = {
  onComposition?(composition: TurnComposition): void;
  onPlanResult?(plan: PlanTurnResult): void;
  /**
   * Fields the module wants on the assistant message. Core applies these both when
   * the stream starts and after the plan result, so ordering between the two does
   * not matter to the module.
   */
  messagePatch?(): Partial<Message> | undefined;
};

export type TurnEffects = {
  onComposition(composition: TurnComposition): void;
  onPlanResult(plan: PlanTurnResult): void;
  messagePatch(): Partial<Message> | undefined;
};

export function createTurnEffects(
  context: TurnEffectsContext,
  runtimes: () => ModuleRuntime[] = loadedModuleRuntimes,
): TurnEffects {
  // The lifecycle is created before `loadModuleRuntimes()` has resolved on a cold
  // page, so the effects list must resolve at the first hook call (every hook fires
  // after the turn has awaited the load), and only once: module effects hold
  // per-turn accumulator state.
  let resolved: ModuleTurnEffects[] | undefined;
  const effects = () =>
    (resolved ??= runtimes()
      .map((runtime) => runtime.turnEffects?.(context))
      .filter((entry): entry is ModuleTurnEffects => !!entry));

  return {
    onComposition: (composition) => effects().forEach((e) => e.onComposition?.(composition)),
    onPlanResult: (plan) => effects().forEach((e) => e.onPlanResult?.(plan)),
    messagePatch: () => {
      let patch: Partial<Message> | undefined;
      for (const effect of effects()) {
        const contribution = effect.messagePatch?.();
        if (!contribution) continue;
        patch = { ...(patch ?? {}), ...contribution };
      }
      return patch;
    },
  };
}
