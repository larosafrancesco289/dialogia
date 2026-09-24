import { useEffect, useRef, type RefObject } from 'react';

/**
 * Close a popup on a pointer press outside it, and optionally on Escape.
 * Both listen on the document in the capture phase, so a press is seen
 * before whatever it lands on handles it. A press inside any of
 * `insideRefs` (the popup, and usually the button that opened it) is left
 * alone.
 */
export function useDismissOnOutside({
  open,
  insideRefs,
  onOutsidePress,
  onEscape,
}: {
  open: boolean;
  insideRefs: ReadonlyArray<RefObject<HTMLElement | null>>;
  onOutsidePress: () => void;
  /** Escape anywhere; left out, Escape is someone else's to handle. */
  onEscape?: () => void;
}) {
  const latest = useRef({ insideRefs, onOutsidePress, onEscape });
  latest.current = { insideRefs, onOutsidePress, onEscape };
  const listensForEscape = Boolean(onEscape);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (latest.current.insideRefs.some((ref) => ref.current?.contains(target))) return;
      latest.current.onOutsidePress();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current.onEscape?.();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    if (listensForEscape) document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      if (listensForEscape) document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, listensForEscape]);
}
