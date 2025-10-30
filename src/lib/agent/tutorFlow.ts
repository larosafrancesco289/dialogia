// Module: agent/tutorFlow
// Responsibility: Build hidden tutor payloads and ensure tutor defaults stay consistent.

import { buildTutorContextFull, buildTutorContextSummary } from '@/lib/agent/tutor';
import type { Message } from '@/lib/types';

export function buildHiddenTutorContent(tutor: unknown): string {
  try {
    const recap = buildTutorContextSummary(tutor as any);
    const json = buildTutorContextFull(tutor as any);
    const parts: string[] = [];
    if (recap) parts.push(`Tutor Recap:\n${recap}`);
    if (json) parts.push(`Tutor Data JSON:\n${json}`);
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

export function ensureTutorDefaults(args: {
  ui: any;
  chat: { settings: any };
  fallbackDefaultModelId: string;
}): { nextSettings: any; changed: boolean; defaultModelId: string } {
  const { ui, chat, fallbackDefaultModelId } = args;
  let tutorDefaultModelId = ui?.tutorDefaultModelId || chat.settings.tutor_default_model;
  if (!tutorDefaultModelId) tutorDefaultModelId = fallbackDefaultModelId;

  const next = { ...chat.settings };
  let changed = false;

  if (next.model !== tutorDefaultModelId) {
    next.model = tutorDefaultModelId;
    changed = true;
  }

  if (next.tutor_default_model !== tutorDefaultModelId) {
    next.tutor_default_model = tutorDefaultModelId;
    changed = true;
  }

  if (next.enableLearnerModel !== true) {
    next.enableLearnerModel = true;
    changed = true;
  }

  if (
    typeof next.learnerModelUpdateFrequency !== 'number' ||
    Number.isNaN(next.learnerModelUpdateFrequency) ||
    next.learnerModelUpdateFrequency <= 0
  ) {
    next.learnerModelUpdateFrequency = 3;
    changed = true;
  }

  return {
    nextSettings: next,
    changed,
    defaultModelId: tutorDefaultModelId,
  };
}

export function mergeTutorPayload(prev: any, patch: any): { merged: any; hiddenContent: string } {
  const merged = { ...(prev || {}), ...(patch || {}) };
  const hiddenContent = buildHiddenTutorContent(merged);
  return { merged, hiddenContent };
}

export function attachTutorUiState(opts: {
  currentUi?: Record<string, any>;
  currentMessages?: Message[];
  messageId: string;
  patch: Record<string, any>;
}): { nextUi: Record<string, any>; nextMessages: Message[]; updatedMessage?: Message } {
  const { currentUi, currentMessages, messageId, patch } = opts;
  const safeUi = currentUi ? { ...currentUi } : {};
  const prevUi = safeUi[messageId] || {};
  const mergedUi = { ...prevUi, ...(patch || {}) };
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
