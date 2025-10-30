import { v4 as uuidv4 } from 'uuid';
import type { StoreState } from '@/lib/store/types';
import type { LearningPlan, Message, TutorEvent, TutorProfile } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import { updateTutorProfile, loadTutorProfile } from '@/lib/tutorProfile';
import { saveMessage } from '@/lib/db';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getNextNode } from '@/lib/agent/planGenerator';

const buildPlanWelcomeMessage = (plan?: LearningPlan): string => {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    return 'Welcome! Share what you want to learn and I’ll build a personalized plan with adaptive mastery tracking.';
  }

  const nextNode = getNextNode(plan);
  if (!nextNode) {
    return `Welcome back! You’ve completed the learning plan for "${plan.goal}". Let me know if you’d like to review or start a new goal.`;
  }

  const description = nextNode.description ? ` — ${nextNode.description}` : '';
  return `Welcome back! We’re working toward "${plan.goal}". Our next focus is ${nextNode.name}${description}. Ask a question or request practice when you’re ready.`;
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
        !!state.ui.experimentalTutor && (state.ui.forceTutorMode || state.ui.nextTutorMode);
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
      try {
        await saveMessage(welcome);
      } catch {}
      return planMessage;
    },
  } satisfies Partial<StoreState>;
}
