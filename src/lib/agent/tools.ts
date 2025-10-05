import { v4 as uuidv4 } from 'uuid';
import type { Chat, Message } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { attachTutorUiState } from '@/lib/agent/tutorFlow';
import { addCardsToDeck, getDueCards } from '@/lib/tutorDeck';
import { runBraveSearch, updateBraveUi } from '@/lib/agent/searchFlow';
import type {
  PersistMessage,
  SearchProvider,
  SearchResult,
  StoreSetter,
  ToolExecutionResult,
  TutorToolCall,
  TutorToolName,
  WebSearchArgs,
} from '@/lib/agent/types';

const INLINE_TUTOR_TOOL_NAMES: TutorToolName[] = ['quiz_mcq'];

const TUTOR_TOOL_NAME_SET = new Set<TutorToolName>([
  'quiz_mcq',
  'quiz_fill_blank',
  'quiz_open_ended',
  'flashcards',
  'grade_open_response',
  'add_to_deck',
  'srs_review',
]);

export function isTutorToolName(name: string): name is TutorToolName {
  return TUTOR_TOOL_NAME_SET.has(name as TutorToolName);
}

export function extractWebSearchArgs(text: string): WebSearchArgs | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const candidates: Array<Record<string, unknown>> = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '{') continue;
      const parsed = parseJsonAfter(text, i);
      if (parsed && typeof parsed.value === 'object' && parsed.value) {
        candidates.push(parsed.value as Record<string, unknown>);
        i = parsed.endIndex;
      }
    }
    for (const payload of candidates) {
      const direct = readSearchPayload(payload);
      if (direct) return direct;
      const payloadName = typeof payload.name === 'string' ? payload.name : '';
      if (payloadName === 'web_search') {
        const args = payload.arguments;
        if (typeof args === 'string') {
          try {
            const inner = JSON.parse(args);
            const nested = readSearchPayload(inner);
            if (nested) return nested;
          } catch {}
        } else if (args && typeof args === 'object') {
          const nested = readSearchPayload(args);
          if (nested) return nested;
        }
      }
    }
  } catch {}
  return null;
}

function readSearchPayload(value: unknown): WebSearchArgs | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const query = typeof record.query === 'string' ? record.query.trim() : '';
  if (!query) return null;
  const rawCount = record.count;
  const count =
    typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? Math.max(1, Math.min(10, Math.floor(rawCount)))
      : undefined;
  return { query, count };
}

export async function performWebSearchTool(opts: {
  args: WebSearchArgs;
  fallbackQuery: string;
  searchProvider: SearchProvider;
  controller: AbortController;
  assistantMessageId: string;
  chatId: string;
  set: StoreSetter;
}): Promise<ToolExecutionResult> {
  const { args, fallbackQuery, searchProvider, controller, assistantMessageId, chatId, set } = opts;
  let rawQuery = typeof args?.query === 'string' ? args.query.trim() : '';
  const parsedCount = Number.parseInt(String(args?.count ?? ''), 10);
  const count = Math.min(Math.max(Number.isFinite(parsedCount) ? parsedCount : 5, 1), 10);
  if (!rawQuery) rawQuery = fallbackQuery.trim().slice(0, 256);

  if (searchProvider === 'brave') {
    updateBraveUi(set, assistantMessageId, { query: rawQuery, status: 'loading' });
  }

  const fetchController = new AbortController();
  const onAbort = () => fetchController.abort();
  controller.signal.addEventListener('abort', onAbort);
  const timeout = setTimeout(() => fetchController.abort(), 20000);

  try {
    const result =
      searchProvider === 'brave'
        ? await runBraveSearch(rawQuery, count, { signal: fetchController.signal })
        : { ok: false, results: [] as SearchResult[], error: undefined };

    if (result.ok) {
      if (searchProvider === 'brave') {
        updateBraveUi(set, assistantMessageId, {
          query: rawQuery,
          status: 'done',
          results: result.results,
        });
      }
      return { ok: true, results: result.results, query: rawQuery };
    }

    if (searchProvider === 'brave') {
      updateBraveUi(set, assistantMessageId, {
        query: rawQuery,
        status: 'error',
        results: [],
        error: result.error || 'No results',
      });
    }
    if (result.error === 'Missing BRAVE_SEARCH_API_KEY') {
      set((state) => ({ ui: { ...state.ui, notice: 'Missing BRAVE_SEARCH_API_KEY' } }));
    }
    return { ok: false, results: [], error: result.error, query: rawQuery };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : undefined;
    if (searchProvider === 'brave') {
      updateBraveUi(set, assistantMessageId, {
        query: rawQuery,
        status: 'error',
        results: [],
        error: errorMessage || 'Network error',
      });
    }
    return { ok: false, results: [], error: errorMessage, query: rawQuery };
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

export function extractTutorToolCalls(text: string): TutorToolCall[] {
  if (typeof text !== 'string' || !text) return [];
  const output: TutorToolCall[] = [];
  for (const tool of INLINE_TUTOR_TOOL_NAMES) {
    const idx = text.indexOf(tool);
    if (idx < 0) continue;
    const cursor = Math.max(text.indexOf(':', idx), text.indexOf('(', idx));
    const parsed = parseJsonAfter(text, cursor >= 0 ? cursor : idx);
    const json = parsed?.value;
    if (json && typeof json === 'object') {
      output.push({ name: tool, args: json as Record<string, unknown> });
    }
  }
  return output;
}

function parseJsonAfter(
  source: string,
  from: number,
): { value: unknown; endIndex: number } | undefined {
  const start = source.indexOf('{', from);
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const raw = source.slice(start, i + 1);
          try {
            return { value: JSON.parse(raw), endIndex: i };
          } catch {
            return undefined;
          }
        }
      }
    }
  }
  return undefined;
}

export type TutorQuizPayload = {
  items: Array<{ id: string; [key: string]: unknown }>;
};

export function normalizeTutorQuizPayload(args: unknown): TutorQuizPayload | null {
  if (!args || typeof args !== 'object') return null;
  const record = args as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items : [];
  if (items.length === 0) return null;
  const normalized = items.slice(0, 40).map((item) => {
    const data = item as Record<string, unknown>;
    const rawId = typeof data.id === 'string' ? data.id.trim() : '';
    const id = !rawId || rawId === 'null' || rawId === 'undefined' ? uuidv4() : rawId;
    return { ...data, id };
  });
  return { items: normalized };
}

export async function applyTutorToolCall(opts: {
  name: TutorToolName;
  args: Record<string, unknown>;
  chat: Chat;
  chatId: string;
  assistantMessage: Message;
  set: StoreSetter;
  persistMessage: PersistMessage;
}): Promise<{ handled: boolean; usedContent: boolean; payload?: string }> {
  const { name, args, chat, chatId, assistantMessage, set, persistMessage } = opts;

  const patchTutorItems = async (mapKey: string) => {
    const normalized = normalizeTutorQuizPayload(args);
    if (!normalized) return { handled: false, usedContent: false } as const;
    let updatedMsg: Message | undefined;
    const titleFromArgs =
      typeof args['title'] === 'string' ? (args['title'] as string) : undefined;
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch: {
          title:
            ((state.ui.tutorByMessageId || {})[assistantMessage.id]?.title as string | undefined) ||
            titleFromArgs,
          [mapKey]: [
            ...((((state.ui.tutorByMessageId || {})[assistantMessage.id] as Record<
              string,
              unknown
            >)?.[mapKey] as unknown[]) || []),
            ...normalized.items,
          ],
        },
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      try {
        await persistMessage(updatedMsg);
      } catch {}
    }
    try {
      const payload: Record<string, unknown> = { items: normalized.items };
      if (titleFromArgs) payload.title = titleFromArgs;
      return { handled: true, usedContent: true, payload: JSON.stringify(payload) } as const;
    } catch {}
    return { handled: true, usedContent: true } as const;
  };

  if (name === 'quiz_mcq') return patchTutorItems('mcq');
  if (name === 'quiz_fill_blank') return patchTutorItems('fillBlank');
  if (name === 'quiz_open_ended') return patchTutorItems('openEnded');
  if (name === 'flashcards') return patchTutorItems('flashcards');

  if (name === 'grade_open_response') {
    const rawId = typeof args['item_id'] === 'string' ? (args['item_id'] as string).trim() : '';
    if (!rawId || rawId === 'null' || rawId === 'undefined') return { handled: false, usedContent: false };
    const feedback =
      typeof args['feedback'] === 'string' ? (args['feedback'] as string).trim() : '';
    if (!feedback) return { handled: false, usedContent: false };
    const score = typeof args['score'] === 'number' ? (args['score'] as number) : undefined;
    const criteria = Array.isArray(args['criteria']) ? (args['criteria'] as unknown[]) : undefined;
    let updatedMsg: Message | undefined;
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch: {
          grading: {
            ...(((state.ui.tutorByMessageId || {})[assistantMessage.id]?.grading as Record<
              string,
              unknown
            >) || {}),
            [rawId]: { feedback, score, criteria },
          },
        },
      });
      if (result.updatedMessage) updatedMsg = result.updatedMessage;
      return {
        ui: { ...state.ui, tutorByMessageId: result.nextUi },
        messages: { ...state.messages, [chatId]: result.nextMessages },
      } as Partial<StoreState>;
    });
    if (updatedMsg) {
      try {
        await persistMessage(updatedMsg);
      } catch {}
    }
    return { handled: true, usedContent: false };
  }

  if (name === 'add_to_deck') {
    try {
      const cards = Array.isArray(args['cards']) ? (args['cards'] as any[]) : [];
      if (cards.length > 0) await addCardsToDeck(chat.id, cards);
    } catch {}
    return { handled: true, usedContent: false };
  }

  if (name === 'srs_review') {
    const cnt = Math.min(
      Math.max(Number.parseInt(String(args['due_count'] ?? '10'), 10) || 10, 1),
      40,
    );
    let due: Record<string, unknown>[] = [];
    try {
      const cards = await getDueCards(chat.id, cnt);
      due = cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        hint: c.hint,
        topic: c.topic,
        skill: c.skill,
      }));
    } catch {}
    return { handled: true, usedContent: false, payload: JSON.stringify(due) };
  }

  return { handled: false, usedContent: false };
}
