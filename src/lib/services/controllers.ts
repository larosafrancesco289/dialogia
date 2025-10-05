// Module: services/controllers
// Responsibility: Coordinate AbortControllers for chat turns and compare runs
// without storing them in Zustand state. Provides helper setters and abortors.

const turnControllers = new Map<string, AbortController>();
const compareControllers = new Map<string, AbortController>();

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

export function setCompareController(runId: string, controller: AbortController) {
  if (!runId) return;
  const existing = compareControllers.get(runId);
  if (existing && existing !== controller) existing.abort();
  compareControllers.set(runId, controller);
}

export function clearCompareController(runId: string) {
  if (!runId) return;
  compareControllers.delete(runId);
}

export function abortAllCompare() {
  compareControllers.forEach((controller) => controller.abort());
  compareControllers.clear();
}

export function abortCompare(runId: string) {
  if (!runId) return;
  const controller = compareControllers.get(runId);
  if (controller) controller.abort();
  compareControllers.delete(runId);
}
