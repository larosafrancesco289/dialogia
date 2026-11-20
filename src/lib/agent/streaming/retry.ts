// Module: agent/streaming/retry
// Responsibility: Sends one model request again when the provider was busy or
// out of reach, as `api/retry` decides, but only while nothing of it has come
// out: no word, no thought, no tool call, no image or citation. Once anything
// has, a failure ends the request as before, since a second answer would
// repeat the first. Every model call of a turn goes through here, each round
// of a tool loop on its own, so a busy moment in a later round no longer
// throws away what the earlier rounds did. The wait is said on the reply and
// ends at once on Stop.

import { decideRetry } from '@/lib/api/retry';
import type { StoreSetter } from '@/lib/agent/types';
import type { StreamCallbacks } from '@/lib/transport/types';

export function abortError(): Error {
  const error = new Error('The turn was stopped.');
  error.name = 'AbortError';
  return error;
}

/** Waits that short go unsaid: a line that comes and goes at once only startles. */
const UNSAID_WAIT_MS = 1_000;

/**
 * Calls `send` with callbacks that pass everything through except an error
 * before the first output, which is held back until it is clear the request
 * will not be sent again: a transport that reports its failure to `onError`
 * before it throws would otherwise end the reply on screen. `onWait` hears
 * when the next attempt goes out (epoch ms), and `undefined` when it has.
 */
export async function streamWithRetry(
  send: (callbacks: StreamCallbacks) => Promise<void>,
  options: {
    callbacks: StreamCallbacks;
    signal: AbortSignal;
    onWait?: (retryAt: number | undefined) => void;
  },
): Promise<void> {
  const { callbacks, signal, onWait } = options;
  let started = false;
  let heldError: Error | undefined;
  const begin = () => {
    started = true;
  };
  const guarded: StreamCallbacks = {
    ...callbacks,
    onToken: (delta) => {
      begin();
      callbacks.onToken?.(delta);
    },
    onReasoningToken: (delta) => {
      begin();
      callbacks.onReasoningToken?.(delta);
    },
    onToolCallDelta: (deltas) => {
      begin();
      callbacks.onToolCallDelta?.(deltas);
    },
    onImage: (dataUrl) => {
      begin();
      callbacks.onImage?.(dataUrl);
    },
    onAnnotations: (annotations) => {
      begin();
      callbacks.onAnnotations?.(annotations);
    },
    onError: (error) => {
      if (started) callbacks.onError?.(error);
      else heldError = error;
    },
  };

  for (let retries = 0; ; retries += 1) {
    heldError = undefined;
    try {
      await send(guarded);
      return;
    } catch (error) {
      const decision =
        started || signal.aborted ? { retry: false as const } : decideRetry(error, retries);
      if (!decision.retry) {
        if (heldError) callbacks.onError?.(heldError);
        throw error;
      }
      try {
        await pause(decision.delayMs, signal, onWait);
      } catch (stopped) {
        // Stopped while waiting: the reply ends as any Stop ends it.
        callbacks.onError?.(stopped as Error);
        throw stopped;
      }
    }
  }
}

async function pause(
  ms: number,
  signal: AbortSignal,
  onWait: ((retryAt: number | undefined) => void) | undefined,
): Promise<void> {
  const said = ms >= UNSAID_WAIT_MS;
  if (said) onWait?.(Date.now() + ms);
  try {
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(abortError());
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  } finally {
    if (said) onWait?.(undefined);
  }
}

/** Says on the reply, through the store, when its request goes out again. */
export function showRetryWait(set: StoreSetter, messageId: string) {
  return (retryAt: number | undefined) =>
    set((state) => {
      const { [messageId]: _was, ...others } = state.ui.retryAtByMessageId ?? {};
      return {
        ui: {
          ...state.ui,
          retryAtByMessageId: retryAt === undefined ? others : { ...others, [messageId]: retryAt },
        },
      };
    });
}
