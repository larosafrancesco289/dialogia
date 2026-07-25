// Module: services/tutorWelcome
// Responsibility: Generate and persist tutor welcome messages for chats.

import type { LearningPlan, Message } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import type { Repository } from '@/lib/db/repository';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { getNextNode } from '@/modules/tutor/learning-plan/service';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { getMessagesForChat, setMessagesForChat } from '@/lib/messages/indexing';
import { createTutorWelcomeMessage } from '@/lib/messages/createMessage';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';

export const buildPlanWelcomeMessage = (plan?: LearningPlan): string => {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    return "Welcome! Share what you want to learn and I'll build a personalized plan with adaptive mastery tracking. Feel free to upload any materials you have to help me understand your learning context.";
  }

  const nextNode = getNextNode(plan);
  if (!nextNode) {
    return `Welcome back! You've completed the learning plan for \"${plan.goal}\". Let me know if you'd like to review or start a new goal. Feel free to upload any new materials if you have them.`;
  }

  const description = nextNode.description ? ` — ${nextNode.description}` : '';
  return `Welcome back! We're working toward \"${plan.goal}\". Our next focus is ${nextNode.name}${description}. Ask a question or request practice when you're ready. You can also upload any relevant materials to support your learning.`;
};

export async function prepareTutorWelcomeMessage({
  chatId,
  set,
  get,
  repository,
}: {
  chatId: string;
  set: StoreSetter;
  get: StoreGetter;
  repository: Repository;
}): Promise<string | undefined> {
  if (!chatId) return undefined;
  const state = get();
  const chat = state.chats.find((entry) => entry.id === chatId);
  const tutorEnabled = chat ? isTutorRuntimeEnabled(state.ui, chat) : false;
  if (!chat || !tutorEnabled) {
    set((s) => ({
      ui: {
        ...s.ui,
        tutor: {
          ...s.ui.tutor,
          welcomeByChatId: {
            ...(s.ui.tutor?.welcomeByChatId || {}),
            [chatId]: { status: 'error', error: 'tutor_disabled' },
          },
        },
      },
    }));
    return undefined;
  }

  const currentMessages = getMessagesForChat(state, chatId);
  const planMessage = buildPlanWelcomeMessage(chat.settings.features.tutor?.learningPlan);

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
      const list = getMessagesForChat(s, chatId) ?? currentMessages;
      const welcomeIndex = findWelcomeIndex(list);
      const existing = welcomeIndex >= 0 ? list[welcomeIndex] : undefined;
      const createdAt = existing?.createdAt ?? resolveInsertionTimestamp(list);
      const modelId =
        chat.settings.features.tutor?.defaultModelId ||
        chat.settings.modelId ||
        DEFAULT_TUTOR_MODEL_ID;
      welcomeMessage = existing
        ? { ...existing, content: trimmed, model: modelId, tutorWelcome: true }
        : createTutorWelcomeMessage({
            chatId,
            content: trimmed,
            createdAt,
            model: modelId,
          });
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
        ...setMessagesForChat(s, chatId, nextMessages),
        ui: {
          ...s.ui,
          tutor: {
            ...s.ui.tutor,
            welcomeByChatId: {
              ...(s.ui.tutor?.welcomeByChatId || {}),
              [chatId]: {
                status: 'ready',
                message: trimmed,
                generatedAt: Date.now(),
              },
            },
            greetedByChatId: { ...(s.ui.tutor?.greetedByChatId || {}), [chatId]: true },
          },
        },
      };
    });
    return welcomeMessage!;
  };

  const welcome = upsertWelcomeMessage(planMessage);
  const persistMessage = createMessagePersister(repository);
  await persistMessage(welcome).catch(() => undefined);
  return planMessage;
}
