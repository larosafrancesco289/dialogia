import type { DeepResearchEvent, Message, MessageDeepResearch } from '@/lib/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';

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
  get: _get,
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
      let errJson: any = {};
      try {
        errJson = JSON.parse(errText);
      } catch {
        // ignore
      }
      throw new Error(errJson?.error || `deep_failed_${res.status}`);
    }

    if (!res.body) throw new Error('no_body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const trace: DeepResearchEvent[] = [];
    let finalResult: unknown = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { type?: string; data?: unknown; error?: string };
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
              return { messages: { ...state.messages, [chatId]: updated } } as any;
            });
          } else if (msg.type === 'result') {
            finalResult = msg.data;
          } else if (msg.type === 'error') {
            throw new Error(msg.error || 'deep_stream_error');
          }
        } catch (e) {
          // Only swallow JSON parse errors from partial chunks; let real stream errors bubble up
          if (!(e instanceof SyntaxError)) throw e;
        }
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
      return { messages: { ...state.messages, [chatId]: updated } } as any;
    });
    await persistMessage(finalMessage);
    if (manageController) set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    if (manageController) clearTurnController(chatId, controller);
    return true;
  } catch (err: any) {
    const errorMessage = String(err?.message || 'DeepResearch failed');
    set((state) => ({
      ui: {
        ...state.ui,
        isStreaming: manageController ? false : state.ui.isStreaming,
        notice: `DeepResearch: ${errorMessage}`,
      },
    }));
    if (manageController) clearTurnController(chatId, controller);
    return false;
  }
}

const DEEP_RESEARCH_EVENT_TYPES = new Set(['search', 'fetch', 'time', 'note', 'thought']);

function isDeepResearchEvent(value: unknown): value is DeepResearchEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' && DEEP_RESEARCH_EVENT_TYPES.has(record.type);
}

function getDeepResearchAnswer(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.answer === 'string' ? record.answer : undefined;
}
