// Module: utils/abort
// Responsibility: Provide small helpers for wiring abort listeners across async tasks.

export async function withAbort<T>(
  parentSignal: AbortSignal,
  task: (controller: AbortController) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason);
  } else {
    parentSignal.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    return await task(controller);
  } finally {
    parentSignal.removeEventListener('abort', forwardAbort);
  }
}
