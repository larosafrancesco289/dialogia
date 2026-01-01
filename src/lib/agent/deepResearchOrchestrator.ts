import type { DeepResearchEvent, Message, MessageDeepResearch } from '@/lib/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { setTurnController, clearTurnController } from '@/lib/services/controllers';
import { parseNdjsonStream } from '@/lib/utils/ndjson';
import { isDeepResearchEvent } from '@/lib/deepResearch/events';
import { notify } from '@/lib/store/notify';
import { adjustActiveTurnCount, clearActiveTurnCount } from '@/lib/ui/streaming';
import { readApiErrorResponse } from '@/lib/api/errors';

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
    set((state) => ({ ui: adjustActiveTurnCount(state.ui, chatId, 1) }));
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
      const apiError = await readApiErrorResponse(res);
      if (apiError?.error) {
        const detail = typeof apiError.detail === 'string' ? `: ${apiError.detail}` : '';
        throw new Error(`${apiError.error}${detail}`);
      }
      throw new Error(`deep_failed_${res.status}`);
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

        set((state) => ({
          messagesById: {
            ...state.messagesById,
            [assistantMessage.id]: {
              ...(state.messagesById[assistantMessage.id] ?? assistantMessage),
              deepResearch,
            },
          },
        }));
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
    set((state) => ({
      messagesById: {
        ...state.messagesById,
        [assistantMessage.id]: finalMessage,
      },
    }));
    await persistMessage(finalMessage);
    if (manageController)
      set((state) => ({
        ui: clearActiveTurnCount(state.ui, chatId),
      }));
    if (manageController) clearTurnController(chatId, controller);
    return true;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'DeepResearch failed';
    const noticeMessage = `DeepResearch: ${errorMessage}`;
    if (manageController) {
      set((state) => ({
        ui: clearActiveTurnCount(state.ui, chatId),
      }));
    }
    notify(get, noticeMessage);
    if (manageController) clearTurnController(chatId, controller);
    return false;
  }
}

function getDeepResearchAnswer(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.answer === 'string' ? record.answer : undefined;
}
