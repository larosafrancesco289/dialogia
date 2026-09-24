// Module: ui/clickIntent
// Responsibility: Tells a single click from the first half of a double click,
// for rows where the two mean different things (a folder: open, or rename).
// The single click waits out the double-click window, so a double click never
// runs it at all.

/** Close to the platforms' default double-click interval without feeling slow. */
export const DOUBLE_CLICK_MS = 250;

type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSingleClickDeferral(
  onSingle: () => void,
  { delayMs = DOUBLE_CLICK_MS, timers = browserTimers }: { delayMs?: number; timers?: Timers } = {},
) {
  let pending: unknown = null;

  const cancel = () => {
    if (pending === null) return;
    timers.clear(pending);
    pending = null;
  };

  return {
    /** `detail` is the event's click count; 0 means no pointer (a scripted click). */
    click(detail: number) {
      cancel();
      if (detail === 0) {
        onSingle();
        return;
      }
      // The second click of a pair: the double-click handler has it.
      if (detail > 1) return;
      pending = timers.set(() => {
        pending = null;
        onSingle();
      }, delayMs);
    },
    cancel,
  };
}
