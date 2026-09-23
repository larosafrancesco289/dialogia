// Module: mobile/backStack
// Responsibility: The phone's Back (Android's button, a swipe back) closes
// the drawer, sheet or page on top instead of leaving the app. While any of
// them is open, one extra history entry stands in for all of them; Back
// pops it, the top one closes, and if more remain the entry is put back.

type Entry = { close: () => void; popped: boolean };

type HistoryLike = Pick<History, 'pushState' | 'back' | 'state'>;

export type BackStack = {
  /** Registers an open overlay; the returned release is called when it closes. */
  push: (close: () => void) => () => void;
  /** The window's popstate. */
  onPopState: () => void;
  size: () => number;
};

export function createBackStack(
  history: HistoryLike,
  defer: (fn: () => void) => void = (fn) => setTimeout(fn, 0),
): BackStack {
  const stack: Entry[] = [];
  let armed = false;
  let ignorePops = 0;

  const arm = () => {
    if (armed) return;
    armed = true;
    // Same URL, same router state: only the entry itself is new.
    history.pushState(history.state, '');
  };

  const onPopState = () => {
    if (ignorePops > 0) {
      ignorePops -= 1;
      return;
    }
    if (!armed) return;
    armed = false;
    const top = stack.pop();
    if (!top) return;
    top.popped = true;
    top.close();
    if (stack.length > 0) arm();
  };

  const push = (close: () => void) => {
    const entry: Entry = { close, popped: false };
    stack.push(entry);
    arm();
    return () => {
      if (entry.popped) return;
      const index = stack.indexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      // Closed by hand. Wait a tick before taking the entry back: one sheet
      // often closes as the next opens (actions, then move to folder), and
      // the next one keeps the entry instead of racing a Back.
      defer(() => {
        if (stack.length > 0 || !armed) return;
        armed = false;
        ignorePops += 1;
        history.back();
      });
    };
  };

  return { push, onPopState, size: () => stack.length };
}

let shared: BackStack | null = null;

/** The app's one back stack, listening to the window's history. */
export function getBackStack(): BackStack {
  if (!shared) {
    shared = createBackStack(window.history);
    window.addEventListener('popstate', shared.onPopState);
  }
  return shared;
}
