// Module: modules/tutor/agent/turnEffects
// Responsibility: What a turn means for the learner model and the learning plan —
// initialise, persist, and record the debug snapshot. Previously interleaved with
// core lifecycle work in src/lib/agent/orchestrator/lifecycle.ts.

import type { ModuleTurnEffects, TurnEffectsContext } from '@/lib/agent/orchestrator/turnEffects';
import type { LearnerModelDebugEntry } from '@/lib/contracts/ui';
import type { LearnerModel, Message } from '@/lib/types';
import {
  getLatestLearnerModel,
  initializeLearnerModel,
  persistLearnerModel,
} from '@/modules/tutor/learner-model';
import { diffPlanUpdates, persistLearningPlan } from '@/modules/tutor/learning-plan/service';

export function createTutorTurnEffects(context: TurnEffectsContext): ModuleTurnEffects {
  const { chatId, assistantMessageId, isPrimary, priorMessages, getChatForTurn, set } = context;
  const { updateChat, persistChat } = context;

  let pendingLearnerModel: LearnerModel | undefined;
  let pendingPlanUpdates: Message['planUpdates'] | undefined;
  let priorLearnerModel: LearnerModel | undefined;

  return {
    onComposition: (composition) => {
      const chat = getChatForTurn();
      const plan = chat.settings.features.tutor?.learningPlan;
      if (!composition.settings.tutorEnabled || !plan) return;
      priorLearnerModel =
        getLatestLearnerModel(priorMessages) ?? initializeLearnerModel(chatId, plan);
    },

    onPlanResult: (plan) => {
      if (plan.learnerModel) pendingLearnerModel = plan.learnerModel;
      if (plan.planUpdates) pendingPlanUpdates = plan.planUpdates;
      const chat = getChatForTurn();

      if (plan.learnerModel) {
        void persistLearnerModel({
          chat,
          chatId,
          learnerModel: plan.learnerModel,
          set,
          updateChat,
          persistChat,
        });
      }

      const currentPlan = chat.settings.features.tutor?.learningPlan;
      if (plan.updatedPlan && plan.updatedPlan !== currentPlan) {
        const diff = plan.planUpdates ?? diffPlanUpdates(currentPlan, plan.updatedPlan);
        if (diff) pendingPlanUpdates = diff;
        // Re-read chat so persistLearningPlan spreads from a snapshot that
        // already includes the learner-model update (its set() is synchronous).
        const chatForPlan = plan.learnerModel ? getChatForTurn() : chat;
        void persistLearningPlan({
          chat: chatForPlan,
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
    },

    messagePatch: () => {
      if (!pendingLearnerModel && !pendingPlanUpdates) return undefined;
      const patch: Partial<Message> = {};
      if (pendingLearnerModel) patch.learnerModel = pendingLearnerModel;
      if (pendingPlanUpdates) patch.planUpdates = pendingPlanUpdates;
      return patch;
    },
  };
}
