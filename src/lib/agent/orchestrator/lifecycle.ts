import { resetEphemeralUi } from '@/lib/ui/defaults';
import { snapshotGenSettings } from '@/lib/agent/generation';
import type { RunTurnHooks } from './turn';
import type { StoreGetter, StoreSetter, TurnComposition, PlanTurnResult } from '@/lib/agent/types';
import type { Chat, Message } from '@/lib/types';
import { createTurnEffects } from '@/lib/agent/orchestrator/turnEffects';

export type TurnLifecycleOptions = {
  chatId: string;
  assistantMessageId: string;
  isPrimary: boolean;
  priorMessages: Message[];
  getChatForTurn: () => Chat;
  set: StoreSetter;
  get: StoreGetter;
  updateMessage: (patch: Partial<Message>) => void;
  updateChat?: (chat: Chat) => void;
  persistChat?: (chat: Chat) => Promise<void> | void;
};

export type TurnLifecycle = {
  hooks: RunTurnHooks;
  latestComposition: () => TurnComposition | undefined;
  latestPlan: () => PlanTurnResult | undefined;
  buildShortCircuitMessage: (baseMessage: Message) => Message;
};

export const createTurnLifecycle = (options: TurnLifecycleOptions): TurnLifecycle => {
  const { isPrimary, set, updateMessage } = options;

  let latestComposition: TurnComposition | undefined;
  let latestPlan: PlanTurnResult | undefined;

  const effects = createTurnEffects(options);

  // Modules accumulate their message fields as the turn progresses. Applying the
  // patch at both points means the module never has to care whether onPlanResult
  // or beforeStream fires first.
  const applyModuleMessagePatch = () => {
    const patch = effects.messagePatch();
    if (patch) updateMessage(patch);
  };

  const hooks: RunTurnHooks = {
    onComposition: (composition) => {
      latestComposition = composition;
      if (isPrimary && composition.consumedTutorNudge) {
        set((state) => ({ ui: resetEphemeralUi(state.ui) }));
      }
      effects.onComposition(composition);
    },
    onPlanResult: (plan) => {
      latestPlan = plan;
      effects.onPlanResult(plan);

      if (latestComposition) {
        try {
          const gen = snapshotGenSettings(latestComposition.settings);
          updateMessage({
            systemSnapshot: plan.finalSystem,
            genSettings: gen,
          });
        } catch {
          /* best effort */
        }
      }

      applyModuleMessagePatch();
    },
    beforeStream: () => {
      applyModuleMessagePatch();
    },
  };

  const buildShortCircuitMessage = (baseMessage: Message): Message => ({
    ...baseMessage,
    ...(effects.messagePatch() ?? {}),
  });

  return {
    hooks,
    latestComposition: () => latestComposition,
    latestPlan: () => latestPlan,
    buildShortCircuitMessage,
  };
};
