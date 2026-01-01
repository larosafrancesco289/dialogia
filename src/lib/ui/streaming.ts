import type { UIState } from '@/lib/store/types';

export function getActiveTurnCount(ui: UIState, chatId?: string): number {
  if (!chatId) return 0;
  return ui.activeTurnByChatId[chatId] ?? 0;
}

export function isChatStreaming(ui: UIState, chatId?: string): boolean {
  return getActiveTurnCount(ui, chatId) > 0;
}

export function setActiveTurnCount(ui: UIState, chatId: string, count: number): UIState {
  const nextCount = Math.max(0, count);
  const nextMap = { ...ui.activeTurnByChatId };
  if (nextCount > 0) {
    nextMap[chatId] = nextCount;
  } else {
    delete nextMap[chatId];
  }
  return { ...ui, activeTurnByChatId: nextMap };
}

export function adjustActiveTurnCount(ui: UIState, chatId: string, delta: number): UIState {
  const current = ui.activeTurnByChatId[chatId] ?? 0;
  return setActiveTurnCount(ui, chatId, current + delta);
}

export function clearActiveTurnCount(ui: UIState, chatId?: string): UIState {
  if (!chatId) return { ...ui, activeTurnByChatId: {} };
  return setActiveTurnCount(ui, chatId, 0);
}
