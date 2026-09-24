import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { canFocus, createLayerStack, tabbableIn, trapTarget } from '@/lib/ui/focus';

type Layer = {
  container: () => HTMLElement | null;
  onEscape: () => (() => void) | undefined;
};

const layers = createLayerStack<Layer>();

// Capture, so a field that swallows its own keys cannot let Tab out.
function onTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const container = layers.top()?.container();
  if (!container) return;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const target = trapTarget(
    tabbableIn(container),
    active,
    event.shiftKey,
    !!active && container.contains(active),
  );
  if (!target) return;
  event.preventDefault();
  (target === 'container' ? container : target).focus();
}

// Bubble, so a field inside that uses Escape (clearing itself, closing its
// list) gets it first and marks it handled.
function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const close = layers.top()?.onEscape();
  if (!close) return;
  event.preventDefault();
  close();
}

function pushLayer(layer: Layer) {
  if (layers.size() === 0) {
    document.addEventListener('keydown', onTab, true);
    document.addEventListener('keydown', onEscape);
  }
  const release = layers.push(layer);
  return () => {
    release();
    if (layers.size() > 0) return;
    document.removeEventListener('keydown', onTab, true);
    document.removeEventListener('keydown', onEscape);
  };
}

/** Focus was dropped (on the page, or on something inside what just closed). */
function focusIsLost(container: HTMLElement | null) {
  const active = document.activeElement;
  if (!active || active === document.body || !active.isConnected) return true;
  return !!container && container.contains(active);
}

type ReturnFocusOptions = {
  /** What is closing; focus left inside it counts as dropped. */
  containerRef?: RefObject<HTMLElement | null>;
  /** Where focus goes when what had it before is gone or cannot take it. */
  fallback?: () => HTMLElement | null | undefined;
};

/**
 * While `active`, remembers what had focus when it began; when it ends, puts
 * focus back there if focus was dropped, and leaves it alone if the reader
 * has moved on. The returned function sends focus back right away.
 */
export function useReturnFocus(active: boolean, options: ReturnFocusOptions = {}) {
  const previousRef = useRef<Element | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const returnFocus = useCallback(() => {
    const previous = previousRef.current;
    const target = canFocus(previous) ? previous : optionsRef.current.fallback?.();
    if (canFocus(target)) target.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!active) return;
    previousRef.current = document.activeElement;
    const container = optionsRef.current.containerRef?.current ?? null;
    return () => {
      if (focusIsLost(container)) returnFocus();
    };
  }, [active, returnFocus]);

  return returnFocus;
}

type ModalFocusOptions = ReturnFocusOptions & {
  /** Where focus starts; the container itself (tabIndex -1) when left out. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Closes on Escape, when this is the dialog on top and nothing inside used the key. */
  onEscape?: () => void;
};

/**
 * A modal's focus: moved in when it opens, kept in while it is on top (Tab
 * and Shift+Tab wrap), and handed back to what had it when it closes.
 * Dialogs stack: only the one opened last traps Tab and answers Escape.
 */
export function useModalFocus(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  options: ModalFocusOptions = {},
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  useReturnFocus(open, { ...options, containerRef });

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    const release = pushLayer({
      container: () => containerRef.current ?? container,
      onEscape: () => optionsRef.current.onEscape,
    });
    const initial = optionsRef.current.initialFocus?.current ?? container;
    if (initial && !container?.contains(document.activeElement)) {
      initial.focus({ preventScroll: true });
    }
    return () => {
      release();
      // What opened it went with it (a row it deleted): the dialog beneath
      // takes focus, so its Escape and Tab still work.
      if (focusIsLost(container)) layers.top()?.container()?.focus({ preventScroll: true });
    };
  }, [open, containerRef]);
}
