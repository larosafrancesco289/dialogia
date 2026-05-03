import type { DeepResearchEvent, Message, MessageDeepResearch } from '@/lib/types';
import type { StoreSetter, StoreGetter } from '@/lib/agent/types';
import { setTurnController, clearTurnController } from '@/lib/turns/runtime';
import { parseNdjsonStream } from '@/lib/utils/ndjson';
import { isDeepResearchEvent } from '@/lib/deep-research/events';
import { notify } from '@/lib/store/notify';
import { adjustActiveTurnCount, clearActiveTurnCount } from '@/lib/ui/streaming';
import { readApiErrorResponse } from '@/lib/api/errors';
import { normalizeUsage } from '@/lib/api/normalizers';
import { providerSortFromRoutePref } from '@/lib/policy/provider';

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
    const state = get();
    const providerSort = providerSortFromRoutePref(state.ui.routePreference);
    const zdrOnly = state.ui.zdrOnly === true;
    const res = await fetch('/api/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: trimmedTask, model: modelId, providerSort, zdrOnly }),
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
    const usage = getDeepResearchUsage(finalResult);
    const promptTokens = usage?.prompt_tokens ?? usage?.input_tokens;
    const completionTokens = usage?.completion_tokens ?? usage?.output_tokens;
    const finalMessage: Message = {
      ...assistantMessage,
      content: answer,
      deepResearch: { trace: trace.slice(), answer },
      usage,
      metrics:
        promptTokens != null || completionTokens != null
          ? { promptTokens, completionTokens }
          : undefined,
      tokensIn: promptTokens,
      tokensOut: completionTokens,
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

function getDeepResearchUsage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!record.usage || typeof record.usage !== 'object' || Array.isArray(record.usage)) {
    return undefined;
  }
  return normalizeUsage(record.usage as Record<string, unknown>);
}
