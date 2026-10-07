// Module: services/tutorWelcome
// Responsibility: Write a tutor chat's greeting, once, before its first message.

import type { LearningPlan, Message } from '@/lib/types';
import type { StoreGetter, StoreSetter } from '@/lib/store/types';
import type { Repository } from '@/lib/db/repository';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { nextReadyNode } from '@/modules/tutor/engine';
import { createMessagePersister } from '@/lib/services/messagePersistence';
import { getMessagesForChat, setMessagesForChat } from '@/lib/messages/indexing';
import { createTutorWelcomeMessage } from '@/lib/messages/createMessage';
import { isTutorRuntimeEnabled } from '@/lib/policy/runtime';
import { joinSentences, withoutEnd } from '@/modules/tutor/lib/text';
import { t } from '@/modules/tutor/i18n';

export const buildPlanWelcomeMessage = (plan?: LearningPlan): string => {
  if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0) {
    return t('welcome.first');
  }

  const goal = t('welcome.goal', { goal: withoutEnd(plan.goal) });
  const nextNode = plan.nodes.find((n) => n.status === 'in_progress') ?? nextReadyNode(plan);
  if (!nextNode) {
    return joinSentences(
      t('welcome.back'),
      t('welcome.finished', { goal }),
      t('welcome.goBack'),
      t('welcome.notesWelcome'),
    );
  }

  const description = nextNode.description?.trim();
  return joinSentences(
    t('welcome.back'),
    t('welcome.workingToward', { goal }),
    description
      ? t('welcome.nextWithDescription', { topic: nextNode.name, description })
      : t('welcome.next', { topic: nextNode.name }),
    t('welcome.ask'),
    t('welcome.addNotes'),
  );
};

/**
 * Writes the tutor's greeting into a chat that has none, before its first user
 * message, and resolves with its text. Awaited by the first send before the
 * request's history is read, so the model sees the greeting the learner saw. A
 * greeting is written once: the top of a transcript must not rewrite itself as
 * the plan moves on, so later calls only return it.
 */
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
  if (!chat || !isTutorRuntimeEnabled(state.ui, chat)) return undefined;

  const written = getMessagesForChat(state, chatId).find(
    (m) => m.role === 'assistant' && m.tutorWelcome,
  );
  if (written) return written.content;

  // A chat that already has a plan (an older one, never greeted) is welcomed back to it.
  const session = await state.ensureTutorSession?.(chatId).catch(() => undefined);
  const content = buildPlanWelcomeMessage(session?.state.plan).trim();

  let welcome: Message | undefined;
  set((s) => {
    const list = getMessagesForChat(s, chatId);
    const firstUserIdx = list.findIndex((m) => m.role === 'user');
    const before = firstUserIdx >= 0 ? firstUserIdx : list.length;
    // An older chat's first reply before any question was its greeting: flag it.
    const existingIdx = list.slice(0, before).findIndex((m) => m.role === 'assistant');
    const modelId =
      chat.settings.features.tutor?.defaultModelId ||
      chat.settings.modelId ||
      DEFAULT_TUTOR_MODEL_ID;
    if (existingIdx >= 0) {
      welcome = { ...list[existingIdx], content, model: modelId, tutorWelcome: true };
      return setMessagesForChat(
        s,
        chatId,
        list.map((m, idx) => (idx === existingIdx ? welcome! : m)),
      );
    }
    const next = list[before];
    welcome = createTutorWelcomeMessage({
      chatId,
      content,
      createdAt: next ? next.createdAt - 1 : Date.now() - 1,
      model: modelId,
    });
    return setMessagesForChat(s, chatId, [
      ...list.slice(0, before),
      welcome,
      ...list.slice(before),
    ]);
  });
  await createMessagePersister(repository)(welcome!).catch(() => undefined);
  return content;
}
