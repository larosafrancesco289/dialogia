import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { LearningPlan, Message, TutorEvent } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import { updateTutorProfile, loadTutorProfile } from '@/lib/tutorProfile';
import { saveMessage } from '@/lib/db';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getNextNode } from '@/lib/learningPlan/service';
import {
  applyLearnerModelFeedback,
  getLatestLearnerModel,
  initializeLearnerModel,
} from '@/lib/agent/learnerModel';
import { processPlanProgress } from '@/lib/agent/planAwareTutor';

const buildPlanWelcomeMessage = (plan?: LearningPlan): string => {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    return 'Welcome! Share what you want to learn and I\'ll build a personalized plan with adaptive mastery tracking. Feel free to upload any materials you have to help me understand your learning context.';
  }

  const nextNode = getNextNode(plan);
  if (!nextNode) {
    return `Welcome back! You've completed the learning plan for "${plan.goal}". Let me know if you'd like to review or start a new goal. Feel free to upload any new materials if you have them.`;
  }

  const description = nextNode.description ? ` — ${nextNode.description}` : '';
  return `Welcome back! We're working toward "${plan.goal}". Our next focus is ${nextNode.name}${description}. Ask a question or request practice when you're ready. You can also upload any relevant materials to support your learning.`;
};

export function createTutorSlice(
  set: StoreSetter,
  get: () => StoreState,
  _store?: unknown,
) {
  return {
    async logTutorResult(evt: TutorEvent) {
      const chatId = get().selectedChatId!;
      if (!chatId) return;
      const prof = await updateTutorProfile(chatId, evt);
      set((s) => ({
        ui: {
          ...s.ui,
          tutorProfileByChatId: { ...(s.ui.tutorProfileByChatId || {}), [chatId]: prof },
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
            tutorProfileByChatId: { ...(s.ui.tutorProfileByChatId || {}), [id]: prof },
          },
        }));
    },
    async primeTutorWelcomePreview() {
      const state = get();
      const tutorActive =
        !!state.ui.experimentalTutor &&
        (state.ui.forceTutorMode || state.ui.next?.tutorMode);
      if (!tutorActive) {
        set((s) => ({
          ui: {
            ...s.ui,
            tutorWelcomePreview: { status: 'idle' },
          },
        }));
        return undefined;
      }
      const selectedChat = state.selectedChatId
        ? state.chats.find((c) => c.id === state.selectedChatId)
        : undefined;
      const plan = selectedChat?.settings?.learningPlan;
      const message = buildPlanWelcomeMessage(plan);
      set((s) => ({
        ui: {
          ...s.ui,
          tutorWelcomePreview: {
            status: 'ready',
            message,
            generatedAt: Date.now(),
          },
        },
      }));
      return message;
    },
    async prepareTutorWelcomeMessage(chatId?: string) {
      const id = chatId || get().selectedChatId;
      if (!id) return undefined;
      const state = get();
      const chat = state.chats.find((c) => c.id === id);
      if (!chat || !chat.settings?.tutor_mode) {
        set((s) => ({
          ui: {
            ...s.ui,
            tutorWelcomeByChatId: {
              ...(s.ui.tutorWelcomeByChatId || {}),
              [id]: { status: 'error', error: 'tutor_disabled' },
            },
          },
        }));
        return undefined;
      }

      const currentMessages = state.messages[id] ?? [];
      const planMessage = buildPlanWelcomeMessage(chat.settings.learningPlan);

      const findWelcomeIndex = (list: Message[]) => {
        const flaggedIdx = list.findIndex((m) => m.role === 'assistant' && m.tutorWelcome);
        if (flaggedIdx >= 0) return flaggedIdx;
        const firstUserIdx = list.findIndex((m) => m.role === 'user');
        const searchLimit = firstUserIdx >= 0 ? firstUserIdx : list.length;
        for (let i = 0; i < searchLimit; i += 1) {
          if (list[i]?.role === 'assistant') return i;
        }
        return -1;
      };

      const resolveInsertionTimestamp = (list: Message[]) => {
        const welcomeIndex = findWelcomeIndex(list);
        if (welcomeIndex >= 0) return list[welcomeIndex].createdAt;
        const firstUser = list.find((m) => m.role === 'user');
        if (firstUser) return firstUser.createdAt - 1;
        const firstAssistant = list.find((m) => m.role === 'assistant');
        if (firstAssistant) return firstAssistant.createdAt - 1;
        return Date.now() - 1;
      };

      const upsertWelcomeMessage = (content: string) => {
        const trimmed = content.trim();
        let welcomeMessage: Message | undefined;
        set((s) => {
          const list = s.messages[id] ?? currentMessages;
          const welcomeIndex = findWelcomeIndex(list);
          const existing = welcomeIndex >= 0 ? list[welcomeIndex] : undefined;
          const createdAt = existing?.createdAt ?? resolveInsertionTimestamp(list);
          const modelId =
            chat.settings.tutor_default_model ||
            chat.settings.model ||
            DEFAULT_TUTOR_MODEL_ID;
          welcomeMessage = existing
            ? { ...existing, content: trimmed, model: modelId, tutorWelcome: true }
            : {
                id: uuidv4(),
                chatId: id,
                role: 'assistant',
                content: trimmed,
                createdAt,
                model: modelId,
                reasoning: '',
                tutorWelcome: true,
              };
          const nextMessages = (() => {
            if (welcomeIndex >= 0)
              return list.map((m, idx) => (idx === welcomeIndex ? welcomeMessage! : m));
            const insertIdx = (() => {
              const firstUserIdx = list.findIndex((m) => m.role === 'user');
              if (firstUserIdx >= 0) return firstUserIdx;
              const firstAssistantIdx = list.findIndex((m) => m.role === 'assistant');
              if (firstAssistantIdx >= 0) return firstAssistantIdx;
              return list.length;
            })();
            const next = [...list];
            next.splice(insertIdx, 0, welcomeMessage!);
            return next;
          })();
          return {
            messages: {
              ...s.messages,
              [id]: nextMessages,
            },
            ui: {
              ...s.ui,
              tutorWelcomeByChatId: {
                ...(s.ui.tutorWelcomeByChatId || {}),
                [id]: {
                  status: 'ready',
                  message: trimmed,
                  generatedAt: Date.now(),
                },
              },
              tutorGreetedByChatId: { ...(s.ui.tutorGreetedByChatId || {}), [id]: true },
            },
          };
        });
        return welcomeMessage!;
      };

      const welcome = upsertWelcomeMessage(planMessage);
      await saveMessage(welcome).catch(() => undefined);
      return planMessage;
    },

    async applyLearnerModelFeedbackFromUser(input: Parameters<typeof applyLearnerModelFeedback>[1]) {
      const state = get();
      const chatId = state.selectedChatId;
      if (!chatId) return;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat || !chat.settings.learningPlan) return;

      const plan = chat.settings.learningPlan;
      const messages = state.messages[chatId] ?? [];
      const baseModel =
        getLatestLearnerModel(messages) ?? initializeLearnerModel(chatId, plan);
      const feedback = applyLearnerModelFeedback(baseModel, input);
      const planResult = await processPlanProgress(plan, feedback.model);
      const updatedPlan = planResult.updatedPlan ?? plan;

      if (typeof state.updateChatSettings === 'function') {
        await state.updateChatSettings({ learningPlan: updatedPlan });
      }

      const nodeMeta = plan.nodes.find((n) => n.id === input.nodeId);
      const beforePct =
        feedback.from != null ? Math.round((feedback.from || 0) * 100) : undefined;
      const afterPct =
        feedback.to != null ? Math.round((feedback.to || 0) * 100) : undefined;
      const summaryParts = [
        `Adjusted mastery for ${nodeMeta?.name || input.nodeId}.`,
      ];
      if (beforePct != null && afterPct != null) {
        summaryParts.push(`Confidence ${beforePct}% → ${afterPct}%.`);
      }
      if (feedback.resolved?.length) {
        summaryParts.push(`Resolved: ${feedback.resolved.join(', ')}`);
      }
      if (input.reason) summaryParts.push(input.reason);

      const planUpdates =
        planResult.planUpdates ??
        ({
          masteryChanges:
            feedback.from != null && feedback.to != null
              ? [{ nodeId: input.nodeId, from: feedback.from, to: feedback.to }]
              : undefined,
          summary: summaryParts.join(' '),
        } as Message['planUpdates']);
      if (planUpdates && !planUpdates.summary) {
        planUpdates.summary = summaryParts.join(' ');
      }

      const assistantMessage: Message = {
        id: uuidv4(),
        chatId,
        role: 'assistant',
        content: summaryParts.join(' '),
        createdAt: Date.now(),
        model: chat.settings.model || DEFAULT_TUTOR_MODEL_ID,
        learnerModel: feedback.model,
        planUpdates,
        metadata: { kind: 'learner_model_feedback' },
      };

      set((s) => ({
        messages: {
          ...s.messages,
          [chatId]: [...(s.messages[chatId] ?? []), assistantMessage],
        },
      }));

      await saveMessage(assistantMessage).catch(() => undefined);
    },
  } satisfies Partial<StoreState>;
}
