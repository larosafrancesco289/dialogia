import type { Message } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { updateBraveUi } from '@/lib/agent/searchFlow';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';

export type DeepResearchContext = {
  task: string;
  modelId: string;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  get: StoreGetter;
  persistMessage: (message: Message) => Promise<void>;
};

export async function runDeepResearchTurn({
  task,
  modelId,
  chatId,
  assistantMessage,
  set,
  get,
  persistMessage,
}: DeepResearchContext): Promise<boolean> {
  const trimmedTask = task.trim();
  if (!trimmedTask) return false;

  const controller = new AbortController();
  setTurnController(chatId, controller);
  set((state) => ({ ui: { ...state.ui, isStreaming: true } }));
  updateBraveUi(set, assistantMessage.id, { query: trimmedTask, status: 'loading' });

  try {
    const res = await fetch('/api/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: trimmedTask, model: modelId }),
      cache: 'no-store',
      signal: controller.signal,
    } as RequestInit);
    const json: any = await res.json().catch(() => ({}));
    const sources = Array.isArray(json?.sources) ? json.sources : [];
    if (!res.ok) throw new Error(json?.error || `deep_failed_${res.status}`);

    set((state) => ({
      ui: {
        ...state.ui,
        nextDeepResearch: state.ui.nextDeepResearch,
      },
    }));
    updateBraveUi(set, assistantMessage.id, {
      query: trimmedTask,
      status: 'done',
      results: sources,
    });

    const finalMessage: Message = {
      ...assistantMessage,
      content: json?.answer || '',
    };
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const updated = list.map((msg) => (msg.id === assistantMessage.id ? finalMessage : msg));
      return { messages: { ...state.messages, [chatId]: updated } } as any;
    });
    await persistMessage(finalMessage);
    set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
    clearTurnController(chatId);
    return true;
  } catch (err: any) {
    const errorMessage = String(err?.message || 'DeepResearch failed');
    set((state) => ({
      ui: {
        ...state.ui,
        isStreaming: false,
        notice: `DeepResearch: ${errorMessage}`,
      },
    }));
    updateBraveUi(set, assistantMessage.id, {
      query: trimmedTask,
      status: 'error',
      error: errorMessage,
    });
    clearTurnController(chatId);
    return false;
  }
}
