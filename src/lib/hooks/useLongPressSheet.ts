'use client';
import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

const DEFAULT_IGNORE_SELECTOR = 'button, .icon-button, a, input, textarea, [role="button"], .badge';

export function useLongPressSheet(opts: {
  isEnabled: boolean;
  delayMs?: number;
  slopPx?: number;
  ignoreSelector?: string;
  onTrigger: () => void;
}) {
  const {
    isEnabled,
    onTrigger,
    delayMs = 320,
    slopPx = 12,
    ignoreSelector = DEFAULT_IGNORE_SELECTOR,
  } = opts;
  const timerRef = useRef<number | undefined>();
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    startRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!isEnabled) return;
      if (event.pointerType === 'mouse') return;
      const target = event.target as HTMLElement | null;
      if (target && ignoreSelector && target.closest(ignoreSelector)) return;

      startRef.current = { x: event.clientX, y: event.clientY };
      timerRef.current = window.setTimeout(() => {
        clearTimer();
        onTrigger();
      }, delayMs);

      const onMove = (ev: PointerEvent) => {
        const start = startRef.current;
        if (!start) return;
        const dx = Math.abs(ev.clientX - start.x);
        const dy = Math.abs(ev.clientY - start.y);
        if (dx > slopPx || dy > slopPx) {
          clearTimer();
        }
      };
      const onEnd = () => {
        clearTimer();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
    },
    [isEnabled, ignoreSelector, delayMs, slopPx, onTrigger, clearTimer],
  );

  const onContextMenu = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (!isEnabled) return;
      event.preventDefault();
      onTrigger();
    },
    [isEnabled, onTrigger],
  );

  return { onPointerDown, onContextMenu };
}
