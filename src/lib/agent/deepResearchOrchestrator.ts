import type { Message } from '@/lib/types';
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
};

export async function runDeepResearchTurn({
  task,
  modelId,
  chatId,
  assistantMessage,
  set,
  get: _get,
  persistMessage,
}: DeepResearchContext): Promise<boolean> {
  const trimmedTask = task.trim();
  if (!trimmedTask) return false;

  const controller = new AbortController();
  setTurnController(chatId, controller);
  set((state) => ({ ui: { ...state.ui, isStreaming: true } }));

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
    const trace: any[] = [];
    let finalResult: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'trace') {
            trace.push(msg.data);
            // Update store with incremental trace
            // We store the structured trace as a JSON string in the 'reasoning' field
            // This allows the UI to parse it back and render the rich timeline
            const reasoningStr = JSON.stringify(trace);

            set((state) => {
              const list = state.messages[chatId] ?? [];
              const updated = list.map((m) =>
                m.id === assistantMessage.id ? { ...m, reasoning: reasoningStr } : m,
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

    const finalMessage: Message = {
      ...assistantMessage,
      content: finalResult?.answer || '',
      reasoning: JSON.stringify(trace), // Ensure final trace is saved
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
    clearTurnController(chatId);
    return false;
  }
}
