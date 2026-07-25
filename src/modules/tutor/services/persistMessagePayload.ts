// Module: modules/tutor/services/persistMessagePayload
// Responsibility: Fold the tutor payload a widget accumulated in UI state back onto
// the message, then persist it. Previously lived in src/lib/services/turns.ts.

import type { Repository } from '@/lib/db/repository';
import type { StoreAccess } from '@/lib/agent/types';
import type { Message, MessageTutor } from '@/lib/types';
import { decorateMessage } from '@/lib/messages/decorate';
import { selectTutorEntry } from '@/lib/ui/tutorState';
import { scheduleTutorPersistence } from '@/modules/tutor/services/tutorPersistence';

export type PersistTutorArgs = {
  messageId: string;
  store: StoreAccess;
  repository: Repository;
};

export async function persistTutorForMessage({ messageId, store, repository }: PersistTutorArgs) {
  const { get, set } = store;
  const state = get();
  const uiTutor = selectTutorEntry(state.ui, messageId);
  if (!uiTutor) return;
  const target = state.messagesById[messageId];
  if (!target) return;
  const merged: MessageTutor = { ...(target.tutor || {}), ...(uiTutor || {}) };
  const nextMessage = decorateMessage({ ...target, tutor: merged }) as Message;
  set((draft) => ({
    messagesById: {
      ...draft.messagesById,
      [messageId]: nextMessage,
    },
  }));
  scheduleTutorPersistence({ message: nextMessage, repository });
}
