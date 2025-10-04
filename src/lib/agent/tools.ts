import { v4 as uuidv4 } from 'uuid';
import type { Chat, Message } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import { attachTutorUiState } from '@/lib/agent/tutorFlow';
import { addCardsToDeck, getDueCards } from '@/lib/tutorDeck';

export type WebSearchRequest = { query: string; count?: number };

export function extractWebSearchArgs(text: string): WebSearchRequest | null {
  if (typeof text !== 'string' || !text) return null;
  try {
    const candidates: Array<Record<string, any>> = [];
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== '{') continue;
      const parsed = parseJsonAfter(text, i);
      if (parsed && parsed.value && typeof parsed.value === 'object') {
        candidates.push(parsed.value);
        i = parsed.endIndex;
      }
    }
    for (const payload of candidates) {
      const direct = readSearchPayload(payload);
      if (direct) return direct;
      if (typeof payload.name === 'string' && payload.name === 'web_search') {
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

function readSearchPayload(value: any): WebSearchRequest | null {
  if (!value || typeof value !== 'object') return null;
  const query = typeof value.query === 'string' ? value.query.trim() : '';
  if (!query) return null;
  const rawCount = value.count;
  const count = Number.isFinite(rawCount)
    ? Math.max(1, Math.min(10, Math.floor(rawCount)))
    : undefined;
  return { query, count };
}

export type TutorToolCall = { name: string; args: any };

export function extractTutorToolCalls(text: string): TutorToolCall[] {
  if (typeof text !== 'string' || !text) return [];
  const supported = ['quiz_mcq'];
  const output: TutorToolCall[] = [];
  for (const tool of supported) {
    const idx = text.indexOf(tool);
    if (idx < 0) continue;
    const cursor = Math.max(text.indexOf(':', idx), text.indexOf('(', idx));
    const parsed = parseJsonAfter(text, cursor >= 0 ? cursor : idx);
    const json = parsed?.value;
    if (json && typeof json === 'object') output.push({ name: tool, args: json });
  }
  return output;
}

function parseJsonAfter(
  source: string,
  from: number,
): { value: any; endIndex: number } | undefined {
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
  items: Array<{ id: string; [key: string]: any }>;
};

export function normalizeTutorQuizPayload(args: any): TutorQuizPayload | null {
  if (!args || typeof args !== 'object') return null;
  const items: any[] = Array.isArray(args.items) ? args.items : [];
  if (items.length === 0) return null;
  const normalized = items.slice(0, 40).map((item) => {
    const raw = (item as any).id;
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    const id = !trimmed || trimmed === 'null' || trimmed === 'undefined' ? uuidv4() : trimmed;
    return { ...item, id };
  });
  return { items: normalized };
}

type StoreSetter = (updater: (state: StoreState) => Partial<StoreState> | void) => void;
type PersistMessage = (message: Message) => Promise<void>;

export async function applyTutorToolCall(opts: {
  name: string;
  args: any;
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
    set((state) => {
      const list = state.messages[chatId] ?? [];
      const result = attachTutorUiState({
        currentUi: state.ui.tutorByMessageId,
        currentMessages: list,
        messageId: assistantMessage.id,
        patch: {
          title:
            ((state.ui.tutorByMessageId || {})[assistantMessage.id]?.title as string | undefined) ||
            args?.title,
          [mapKey]: [
            ...((((state.ui.tutorByMessageId || {})[assistantMessage.id] as any)?.[
              mapKey
            ] as any[]) || []),
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
      if (typeof args?.title === 'string') payload.title = args.title;
      return { handled: true, usedContent: true, payload: JSON.stringify(payload) } as const;
    } catch {}
    return { handled: true, usedContent: true } as const;
  };

  if (name === 'quiz_mcq') return patchTutorItems('mcq');
  if (name === 'quiz_fill_blank') return patchTutorItems('fillBlank');
  if (name === 'quiz_open_ended') return patchTutorItems('openEnded');
  if (name === 'flashcards') return patchTutorItems('flashcards');

  if (name === 'grade_open_response') {
    const rawId = args?.item_id;
    const itemId = (() => {
      const s = typeof rawId === 'string' ? rawId.trim() : '';
      if (!s || s === 'null' || s === 'undefined') return '';
      return s;
    })();
    const feedback = String(args?.feedback || '').trim();
    const score = typeof args?.score === 'number' ? args.score : undefined;
    const criteria = Array.isArray(args?.criteria) ? args.criteria : undefined;
    if (!itemId || !feedback) return { handled: false, usedContent: false };
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
              any
            >) || {}),
            [itemId]: { feedback, score, criteria },
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
      const cards = Array.isArray(args?.cards) ? args.cards : [];
      if (cards.length > 0) await addCardsToDeck(chat.id, cards);
    } catch {}
    return { handled: true, usedContent: false };
  }

  if (name === 'srs_review') {
    const cnt = Math.min(Math.max(parseInt(String(args?.due_count || '10'), 10) || 10, 1), 40);
    let due: any[] = [];
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
