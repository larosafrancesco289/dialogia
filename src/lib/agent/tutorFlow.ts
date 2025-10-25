// Module: agent/tutorFlow
// Responsibility: Centralize tutor hidden-context composition and memory update orchestration.

import { buildTutorContextFull, buildTutorContextSummary } from '@/lib/agent/tutor';
import {
  updateTutorMemory,
  normalizeTutorMemory,
  getTutorMemoryFrequency,
  EMPTY_TUTOR_MEMORY,
} from '@/lib/agent/tutorMemory';
import type { Message, ModelTransport } from '@/lib/types';

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
  fallbackMemoryModelId: string;
}): { nextSettings: any; changed: boolean; defaultModelId: string; memoryModelId: string } {
  const { ui, chat, fallbackDefaultModelId, fallbackMemoryModelId } = args;
  let tutorDefaultModelId = ui?.tutorDefaultModelId || chat.settings.tutor_default_model;
  let tutorMemoryModelId =
    ui?.tutorMemoryModelId || chat.settings.tutor_memory_model || tutorDefaultModelId;
  if (!tutorDefaultModelId) tutorDefaultModelId = fallbackDefaultModelId;
  if (!tutorMemoryModelId) tutorMemoryModelId = fallbackMemoryModelId;
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
  if (next.tutor_memory_model !== tutorMemoryModelId) {
    next.tutor_memory_model = tutorMemoryModelId;
    changed = true;
  }
  const normalizedMem = normalizeTutorMemory(next.tutor_memory);
  if (normalizedMem !== next.tutor_memory) {
    next.tutor_memory = normalizedMem;
    changed = true;
  }
  if (typeof next.tutor_memory_frequency !== 'number' || next.tutor_memory_frequency <= 0) {
    next.tutor_memory_frequency = getTutorMemoryFrequency(next);
    changed = true;
  }
  if (typeof next.tutor_memory_message_count !== 'number' || next.tutor_memory_message_count < 0) {
    next.tutor_memory_message_count = 0;
    changed = true;
  }
  return {
    nextSettings: next,
    changed,
    defaultModelId: tutorDefaultModelId,
    memoryModelId: tutorMemoryModelId,
  };
}

export async function maybeAdvanceTutorMemory(args: {
  apiKey: string;
  transport: ModelTransport;
  modelId: string;
  settings: any;
  conversation: Message[];
  autoUpdate: boolean;
}): Promise<{
  nextSettings: any;
  debug?: {
    before?: string;
    after?: string;
    version?: number;
    messageCount?: number;
    conversationWindow?: string;
    raw?: string;
  };
}> {
  const { apiKey, transport, modelId, settings, conversation, autoUpdate } = args;
  const priorCount = settings.tutor_memory_message_count ?? 0;
  const frequency = getTutorMemoryFrequency(settings);
  const nextCount = priorCount + 1;
  let newCount = nextCount;
  let newMemory = settings.tutor_memory || EMPTY_TUTOR_MEMORY;
  let version = settings.tutor_memory_version ?? 0;
  let debug: any | undefined;
  if (autoUpdate && nextCount >= frequency) {
    try {
      const result = await updateTutorMemory({
        apiKey,
        transport,
        model: modelId,
        existingMemory: settings.tutor_memory,
        conversation,
        frequency,
      });
      newMemory = result.memory;
      version += 1;
      newCount = 0;
      debug = {
        before: settings.tutor_memory,
        after: newMemory,
        version,
        messageCount: nextCount,
        conversationWindow: result.conversationWindow,
        raw: result.raw,
      };
    } catch {
      // Swallow; caller can handle notices via UI if desired
    }
  }
  if (!autoUpdate) {
    // Only bump the counter; do not run the update
    if (nextCount !== priorCount) {
      newCount = nextCount;
    }
  }
  const nextSettings = {
    ...settings,
    tutor_memory: newMemory,
    tutor_memory_version: version,
    tutor_memory_message_count: newCount,
  };
  return { nextSettings, debug };
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
