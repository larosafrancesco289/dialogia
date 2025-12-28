import { resetEphemeralUi } from '@/lib/ui/defaults';
import { getLatestLearnerModel, initializeLearnerModel } from '@/lib/agent/learnerModel';
import { snapshotGenSettings } from '@/lib/agent/generation';
import type { RunTurnHooks } from './turn';
import type { StoreGetter, StoreSetter, TurnComposition, PlanTurnResult } from '@/lib/agent/types';
import type { Chat, LearnerModel, Message } from '@/lib/types';
import type { LearnerModelDebugEntry } from '@/lib/contracts/ui';
import { diffPlanUpdates, persistLearningPlan } from '@/lib/learningPlan/service';

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
  const {
    chatId,
    assistantMessageId,
    isPrimary,
    priorMessages,
    getChatForTurn,
    set,
    updateMessage,
    updateChat,
    persistChat,
  } = options;

  let pendingLearnerModel: LearnerModel | undefined;
  let pendingPlanUpdates: Message['planUpdates'] | undefined;
  let priorLearnerModel: LearnerModel | undefined;
  let latestComposition: TurnComposition | undefined;
  let latestPlan: PlanTurnResult | undefined;

  const attachLearnerContextToAssistant = () => {
    if (!pendingLearnerModel && !pendingPlanUpdates) return;
    const patch: Partial<Message> = {};
    if (pendingLearnerModel) patch.learnerModel = pendingLearnerModel;
    if (pendingPlanUpdates) patch.planUpdates = pendingPlanUpdates;
    updateMessage(patch);
  };

  const hooks: RunTurnHooks = {
    onComposition: (composition) => {
      latestComposition = composition;
      if (isPrimary && composition.consumedTutorNudge) {
        set((state) => ({ ui: resetEphemeralUi(state.ui) }));
      }
      const chat = getChatForTurn();
      if (composition.settings.tutorEnabled && chat.settings.learningPlan) {
        priorLearnerModel =
          getLatestLearnerModel(priorMessages) ??
          initializeLearnerModel(chatId, chat.settings.learningPlan);
      }
    },
    onPlanResult: (plan) => {
      latestPlan = plan;
      if (plan.learnerModel) pendingLearnerModel = plan.learnerModel;
      if (plan.planUpdates) pendingPlanUpdates = plan.planUpdates;
      const chat = getChatForTurn();
      if (plan.updatedPlan && plan.updatedPlan !== chat.settings.learningPlan) {
        const diff =
          plan.planUpdates ?? diffPlanUpdates(chat.settings.learningPlan, plan.updatedPlan);
        if (diff) pendingPlanUpdates = diff;
        void persistLearningPlan({
          chat,
          chatId,
          plan: plan.updatedPlan,
          set,
          updateChat,
          persistChat,
        });
      }
      if (isPrimary && plan.learnerModel && plan.learnerModelDebug && priorLearnerModel) {
        const entry: LearnerModelDebugEntry = {
          before: priorLearnerModel,
          after: plan.learnerModel,
          debug: plan.learnerModelDebug,
          planUpdates: plan.planUpdates,
        };
        set((state) => ({
          ui: {
            ...state.ui,
            debug: {
              ...state.ui.debug,
              learnerModelDebugByMessageId: {
                ...(state.ui.debug.learnerModelDebugByMessageId || {}),
                [assistantMessageId]: entry,
              },
            },
          },
        }));
      }
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
    },
    beforeStream: () => {
      attachLearnerContextToAssistant();
    },
  };

  const buildShortCircuitMessage = (baseMessage: Message): Message => ({
    ...baseMessage,
    learnerModel: pendingLearnerModel ?? baseMessage.learnerModel,
    planUpdates: pendingPlanUpdates ?? baseMessage.planUpdates,
  });

  return {
    hooks,
    latestComposition: () => latestComposition,
    latestPlan: () => latestPlan,
    buildShortCircuitMessage,
  };
};
