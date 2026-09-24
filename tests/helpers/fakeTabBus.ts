import type { BroadcastPort } from '@/lib/sync/tabChannel';

/**
 * Stands in for `BroadcastChannel` between tabs in one process: a message
 * reaches every other port asynchronously, never the port that sent it.
 */
export function createFakeBus() {
  const ports: Array<{ deliver: (data: unknown) => void }> = [];
  let pending: Promise<void> = Promise.resolve();

  const open = (): BroadcastPort => {
    const listeners: Array<(event: { data: unknown }) => void> = [];
    const self = {
      deliver: (data: unknown) => listeners.forEach((listener) => listener({ data })),
    };
    ports.push(self);
    return {
      postMessage(data) {
        const copy = structuredClone(data);
        for (const port of ports) {
          if (port === self) continue;
          pending = pending.then(() => port.deliver(copy));
        }
      },
      addEventListener(_type, listener) {
        listeners.push(listener);
      },
    };
  };

  /** Resolves once every message posted so far has been delivered. */
  const settle = async () => {
    let seen: Promise<void> | undefined;
    while (seen !== pending) {
      seen = pending;
      await seen;
    }
  };

  return { open, settle };
}
