// Module: services/controllers
// Responsibility: Coordinate AbortControllers for chat turns without storing them in
// Zustand state. Provides helper setters and abortors.

const turnControllers = new Map<string, AbortController>();

export function setTurnController(chatId: string, controller: AbortController) {
  if (!chatId) return;
  const existing = turnControllers.get(chatId);
  if (existing && existing !== controller) existing.abort();
  turnControllers.set(chatId, controller);
}

export function getTurnController(chatId: string): AbortController | undefined {
  if (!chatId) return undefined;
  return turnControllers.get(chatId);
}

export function clearTurnController(chatId: string) {
  if (!chatId) return;
  turnControllers.delete(chatId);
}

export function abortTurn(chatId: string) {
  if (!chatId) return;
  const controller = turnControllers.get(chatId);
  if (controller) controller.abort();
  turnControllers.delete(chatId);
}

export function abortAllTurns() {
  turnControllers.forEach((controller) => controller.abort());
  turnControllers.clear();
}
