import type { StoreSetter, StoreState } from '@/lib/store/types';
import type { MessageTutor, TutorEvent } from '@/lib/types';
import type { LearnerModelFeedback } from '@/lib/agent/learner-model';
import { updateTutorProfile, loadTutorProfile } from '@/lib/tutor/profile';
import { repository } from '@/lib/db';
import { readNextOverrides } from '@/lib/ui/next';
import {
  buildPlanWelcomeMessage,
  prepareTutorWelcomeMessage as prepareTutorWelcomeMessageService,
} from '@/lib/services/tutorWelcome';

// Pulls in the learner-model pipeline; only reachable from an explicit user action.
const loadLearnerModelFeedback = () => import('@/lib/services/learnerModelFeedback');

type McqAttempts = NonNullable<MessageTutor['attempts']>['mcq'];

export function createTutorSlice(set: StoreSetter, get: () => StoreState, _store?: unknown) {
  const updateTutorEntry = (messageId: string, updater: (prev: MessageTutor) => MessageTutor) => {
    if (!messageId) return;
    set((state) => {
      const current = state.ui.tutor.byMessageId || {};
      const prevEntry = (current[messageId] || {}) as MessageTutor;
      const nextEntry = updater(prevEntry);
      return {
        ui: {
          ...state.ui,
          tutor: {
            ...state.ui.tutor,
            byMessageId: { ...current, [messageId]: nextEntry },
          },
        },
      };
    });
  };

  return {
    async logTutorResult(evt: TutorEvent) {
      const chatId = get().selectedChatId!;
      if (!chatId) return;
      const prof = await updateTutorProfile(chatId, evt);
      set((s) => ({
        ui: {
          ...s.ui,
          tutor: {
            ...s.ui.tutor,
            profileByChatId: { ...(s.ui.tutor.profileByChatId || {}), [chatId]: prof },
          },
        },
      }));
    },
    async loadTutorProfileIntoUI(chatId?: string) {
      const id = chatId || get().selectedChatId!;
      if (!id) return;
      const prof = await loadTutorProfile(id);
      if (prof)
        set((s) => ({
          ui: {
            ...s.ui,
            tutor: {
              ...s.ui.tutor,
              profileByChatId: { ...(s.ui.tutor.profileByChatId || {}), [id]: prof },
            },
          },
        }));
    },
    async primeTutorWelcomePreview() {
      const state = get();
      const nextOverrides = readNextOverrides(state.ui);
      const tutorActive =
        !!state.ui.flags.experimentalTutor && (state.ui.tutor.forceMode || nextOverrides.tutorMode);
      if (!tutorActive) {
        set((s) => ({
          ui: {
            ...s.ui,
            tutor: {
              ...s.ui.tutor,
              welcomePreview: { status: 'idle' },
            },
          },
        }));
        return undefined;
      }
      const selectedChat = state.selectedChatId
        ? state.chats.find((c) => c.id === state.selectedChatId)
        : undefined;
      const plan = selectedChat?.settings?.features.tutor.learningPlan;
      const message = buildPlanWelcomeMessage(plan);
      set((s) => ({
        ui: {
          ...s.ui,
          tutor: {
            ...s.ui.tutor,
            welcomePreview: {
              status: 'ready',
              message,
              generatedAt: Date.now(),
            },
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

    async applyLearnerModelFeedbackFromUser(input: LearnerModelFeedback) {
      const { applyLearnerModelFeedbackFromUser: apply } = await loadLearnerModelFeedback();
      await apply({ input, set, get, repository });
    },

    async patchTutorEntry(
      messageId: string,
      patch: Partial<MessageTutor>,
      opts?: { persist?: boolean },
    ) {
      updateTutorEntry(messageId, (prev) => ({ ...prev, ...patch }));
      if (opts?.persist === false) return;
      await get()
        .persistTutorStateForMessage(messageId)
        .catch(() => undefined);
    },

    setTutorPlanProposalStatus(messageId, status) {
      updateTutorEntry(messageId, (prev) => {
        if (!prev.planProposal) return prev;
        return {
          ...prev,
          planProposal: {
            ...prev.planProposal,
            status,
            resolvedAt: Date.now(),
          },
        };
      });
      void get().persistTutorStateForMessage(messageId);
    },

    setTutorAttemptMcq(messageId, itemId, choiceIdx, correct) {
      updateTutorEntry(messageId, (prev) => {
        const prevAttempts = prev.attempts || {};
        const prevMcq: McqAttempts = prevAttempts.mcq ?? {};
        return {
          ...prev,
          attempts: {
            ...prevAttempts,
            mcq: {
              ...prevMcq,
              [itemId]: { choice: choiceIdx, done: true, correct },
            },
          },
        };
      });
      void get().persistTutorStateForMessage(messageId);
    },
  } satisfies Partial<StoreState>;
}
