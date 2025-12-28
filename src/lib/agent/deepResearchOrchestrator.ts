import type { DeepResearchEvent, Message, MessageDeepResearch } from '@/lib/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { parseNdjsonStream } from '@/lib/utils/ndjson';
import { isDeepResearchEvent } from '@/lib/deepResearch/events';

export type DeepResearchContext = {
  task: string;
  modelId: string;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: (message: Message) => Promise<void>;
  controller?: AbortController;
};

export async function runDeepResearchTurn({
  task,
  modelId,
  chatId,
  assistantMessage,
  set,
  get,
  persistMessage,
  controller: providedController,
}: DeepResearchContext): Promise<boolean> {
  const trimmedTask = task.trim();
  if (!trimmedTask) return false;

  const controller = providedController ?? new AbortController();
  const manageController = !providedController;

  if (manageController) {
    setTurnController(chatId, controller);
    set((state) => ({ ui: { ...state.ui, isStreaming: true } }));
  }

  try {
    const res = await fetch('/api/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: trimmedTask, model: modelId }),
      cache: 'no-store',
      signal: controller.signal,
    } as RequestInit);

    if (!res.ok) {
      // Try to read error from body if possible, otherwise default
      const errText = await res.text().catch(() => '');
      let errJson: Record<string, unknown> = {};
      try {
        errJson = JSON.parse(errText);
      } catch {
        // ignore
      }
      const errMessage = typeof errJson.error === 'string' ? errJson.error : undefined;
      throw new Error(errMessage || `deep_failed_${res.status}`);
    }

    if (!res.body) throw new Error('no_body');

    const trace: DeepResearchEvent[] = [];
    let finalResult: unknown = null;

    for await (const payload of parseNdjsonStream(res.body)) {
      const msg = payload as { type?: string; data?: unknown; error?: string };
      if (msg.type === 'trace') {
        if (isDeepResearchEvent(msg.data)) {
          trace.push(msg.data);
        }
        // Update store with incremental trace
        const deepResearch: MessageDeepResearch = { trace: trace.slice() };

        set((state) => {
          const list = state.messages[chatId] ?? [];
          const updated = list.map((m) =>
            m.id === assistantMessage.id ? { ...m, deepResearch } : m,
          );
          return { messages: { ...state.messages, [chatId]: updated } };
        });
      } else if (msg.type === 'result') {
        finalResult = msg.data;
      } else if (msg.type === 'error') {
        throw new Error(msg.error || 'deep_stream_error');
      }
    }

    if (!finalResult) throw new Error('stream_ended_no_result');

    const answer = getDeepResearchAnswer(finalResult) || '';
    const finalMessage: Message = {
      ...assistantMessage,
      content: answer,
      deepResearch: { trace: trace.slice(), answer },
    };
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const updated = list.map((msg) => (msg.id === assistantMessage.id ? finalMessage : msg));
      return { messages: { ...state.messages, [chatId]: updated } };
    });
    await persistMessage(finalMessage);
    if (manageController) set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    if (manageController) clearTurnController(chatId, controller);
    return true;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'DeepResearch failed';
    const noticeMessage = `DeepResearch: ${errorMessage}`;
    set((state) => ({
      ui: {
        ...state.ui,
        isStreaming: manageController ? false : state.ui.isStreaming,
      },
    }));
    const setNotice = get().setNotice;
    if (typeof setNotice === 'function') {
      setNotice(noticeMessage);
    } else {
      set((state) => ({
        ui: {
          ...state.ui,
          notice: noticeMessage,
        },
      }));
    }
    if (manageController) clearTurnController(chatId, controller);
    return false;
  }
}

function getDeepResearchAnswer(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.answer === 'string' ? record.answer : undefined;
}
