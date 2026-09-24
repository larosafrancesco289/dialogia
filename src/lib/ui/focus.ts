// Module: ui/focus
// Responsibility: Where keyboard focus may go and where it goes next: what Tab
// reaches inside a container, where a trapped Tab wraps to, and which item an
// arrow key lands on in a menu or radio group.

const TABBABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]',
].join(',');

/** Whether focus can land on `el` right now: on the page, shown, and not inert or disabled. */
export function canFocus(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement) || !el.isConnected) return false;
  if (el.closest('[inert]')) return false;
  if ((el as HTMLButtonElement).disabled) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== 'hidden';
}

/** The composer's field (ComposerInput's class). */
export const COMPOSER_FIELD_SELECTOR = 'textarea.composer-field';

/**
 * Sends focus to the composer: where the reader goes next when what held
 * focus (a reply's footer) goes away as a new reply starts.
 */
export function focusComposer(root: ParentNode = document): boolean {
  const field = root.querySelector(COMPOSER_FIELD_SELECTOR);
  if (!canFocus(field)) return false;
  field.focus({ preventScroll: true });
  return true;
}

/** The elements Tab visits inside `container`, in order. */
export function tabbableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE)).filter((el) => {
    if (el.tabIndex < 0 || !canFocus(el)) return false;
    // Tab reaches one radio of a group: the checked one, if there is one.
    if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked && el.name) {
      const group = container.querySelectorAll<HTMLInputElement>(
        `input[type="radio"][name="${CSS.escape(el.name)}"]`,
      );
      return !Array.from(group).some((radio) => radio.checked);
    }
    return true;
  });
}

/**
 * Where a Tab inside a trap goes instead of where the browser would send it:
 * past the last stop back to the first (Shift+Tab the other way), and in
 * from outside. `null` means the browser's own move stays inside, so let it.
 * `'container'` means there is nothing to tab to; focus the container.
 */
export function trapTarget<T>(
  items: readonly T[],
  active: T | null,
  shift: boolean,
  activeInside: boolean,
): T | 'container' | null {
  if (items.length === 0) return 'container';
  const first = items[0];
  const last = items[items.length - 1];
  if (!activeInside || active === null) return shift ? last : first;
  const index = items.indexOf(active);
  // On the container itself, or on something inside that Tab does not stop at.
  if (index === -1) return shift ? last : first;
  if (shift && index === 0) return last;
  if (!shift && index === items.length - 1) return first;
  return null;
}

/**
 * The item an arrow key moves to, wrapping at the ends; `null` for any other
 * key. A menu moves on Up and Down; a radio group on every arrow.
 */
export function indexForKey(
  key: string,
  current: number,
  count: number,
  arrows: 'vertical' | 'both' = 'vertical',
): number | null {
  if (count <= 0) return null;
  const next = key === 'ArrowDown' || (arrows === 'both' && key === 'ArrowRight');
  const previous = key === 'ArrowUp' || (arrows === 'both' && key === 'ArrowLeft');
  if (next) return current < 0 ? 0 : (current + 1) % count;
  if (previous) return current <= 0 ? count - 1 : current - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

export type LayerStack<T> = {
  /** Registers an open layer on top; the returned release removes it, wherever it sits. */
  push: (layer: T) => () => void;
  top: () => T | undefined;
  size: () => number;
};

/** Open dialogs in the order they opened: only the top one answers the keyboard. */
export function createLayerStack<T>(): LayerStack<T> {
  const layers: T[] = [];
  return {
    push: (layer) => {
      layers.push(layer);
      return () => {
        const index = layers.lastIndexOf(layer);
        if (index !== -1) layers.splice(index, 1);
      };
    },
    top: () => layers[layers.length - 1],
    size: () => layers.length,
  };
}
