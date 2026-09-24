import { useCallback, useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { useReturnFocus } from '@/lib/hooks/useModalFocus';
import { indexForKey } from '@/lib/ui/focus';

const ITEM = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>(ITEM)).filter(
    (item) => !(item as HTMLButtonElement).disabled,
  );
}

const isField = (target: EventTarget | null) =>
  target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]');

/**
 * A popup menu's keyboard: focus on the first item when it opens, Up, Down,
 * Home and End between items, Escape closes it and Tab leaves it, both
 * handing focus back to the button that opened it. Attach the returned
 * handler to the menu's `onKeyDown`.
 */
export function useMenuKeyboard({
  open,
  menuRef,
  onClose,
  triggerRef,
}: {
  open: boolean;
  menuRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  /** The opening button, when focus may not have been on it (a click in Safari). */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocus = useReturnFocus(open, {
    containerRef: menuRef,
    fallback: () => triggerRef?.current,
  });

  useEffect(() => {
    if (!open) return;
    menuItems(menuRef.current)[0]?.focus({ preventScroll: true });
    // Escape wherever focus is, so a click on the menu's heading does not
    // strand it. A field inside (naming a folder) keeps its own Escape.
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || isField(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, menuRef]);

  return useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        // Back to the button first, so the browser's Tab carries on from there.
        returnFocus();
        onCloseRef.current();
        return;
      }
      const items = menuItems(menuRef.current);
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next = indexForKey(event.key, current, items.length);
      if (next === null) return;
      event.preventDefault();
      items[next]?.focus();
    },
    [menuRef, returnFocus],
  );
}
