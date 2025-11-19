// Module: agent/tutorFlow
// Responsibility: Build hidden tutor payloads and ensure tutor defaults stay consistent.

import { getTutorContext } from '@/lib/agent/tutor';
import type { Message, MessageTutor } from '@/lib/types';
import { applyTutorDefaults } from '@/lib/store/normalize';

export function buildHiddenTutorContent(tutor: MessageTutor | undefined): string {
  try {
    const { summary: recap, full: json } = getTutorContext(tutor);
    const parts: string[] = [];
    if (recap) parts.push(`Tutor Recap:\n${recap}`);
    if (json) parts.push(`Tutor Data JSON:\n${json}`);
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

export const ensureTutorDefaults = applyTutorDefaults;

export function mergeTutorPayload(
  prev: MessageTutor | undefined,
  patch: Partial<MessageTutor> | undefined,
): { merged: MessageTutor; hiddenContent: string } {
  const merged = { ...(prev || {}), ...(patch || {}) } as MessageTutor;
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
    const prevTutor = (msg as any).tutor || {};
    const { merged, hiddenContent } = mergeTutorPayload(prevTutor, patch);
    const next = { ...(msg as any), tutor: merged, hiddenContent } as Message;
    updatedMessage = next;
    return next;
  });

  return { nextUi: safeUi, nextMessages, updatedMessage };
}
