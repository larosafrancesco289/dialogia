// Module: agent/tutorFlow
// Responsibility: Build hidden tutor payloads and ensure tutor defaults stay consistent.

import type { Message, MessageTutor } from '@/lib/types';
import { buildHiddenTutorContent } from '@/lib/tutor/hiddenContent';
import { applyTutorDefaults } from '@/lib/tutor/defaults';

export { buildHiddenTutorContent };

export const ensureTutorDefaults = applyTutorDefaults;

export function mergeTutorPayload(
  prev: MessageTutor | undefined,
  patch: Partial<MessageTutor> | undefined,
): { merged: MessageTutor; hiddenContent: string } {
  const merged: MessageTutor = { ...(prev || {}), ...(patch || {}) };
  const hiddenContent = buildHiddenTutorContent(merged);
  return { merged, hiddenContent };
}

export function attachTutorUiState(opts: {
  currentUi?: Record<string, MessageTutor>;
  currentMessages?: Message[];
  messageId: string;
  patch: Partial<MessageTutor>;
}): { nextUi: Record<string, MessageTutor>; nextMessages: Message[]; updatedMessage?: Message } {
  const { currentUi, currentMessages, messageId, patch } = opts;
  const safeUi: Record<string, MessageTutor> = currentUi ? { ...currentUi } : {};
  const prevUi = safeUi[messageId] || ({} as MessageTutor);
  const mergedUi: MessageTutor = { ...prevUi, ...(patch || {}) };
  safeUi[messageId] = mergedUi;

  const sourceMessages = Array.isArray(currentMessages) ? currentMessages : [];
  let updatedMessage: Message | undefined;
  const nextMessages = sourceMessages.map((msg) => {
    if (msg.id !== messageId) return msg;
    const prevTutor = msg.tutor || {};
    const { merged, hiddenContent } = mergeTutorPayload(prevTutor, patch);
    const next: Message = { ...msg, tutor: merged, hiddenContent };
    updatedMessage = next;
    return next;
  });

  return { nextUi: safeUi, nextMessages, updatedMessage };
}
