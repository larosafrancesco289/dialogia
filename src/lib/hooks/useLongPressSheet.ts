import { useRef } from 'react';

type UseLongPressSheetOptions = {
  enabled: boolean;
  onLongPress: () => void;
  onTap?: () => void;
  delayMs?: number;
  moveThreshold?: number;
};

export function useLongPressSheet(opts: UseLongPressSheetOptions) {
  const { enabled, onLongPress, onTap, delayMs = 480, moveThreshold = 10 } = opts;
  const startX = useRef(0);
  const startY = useRef(0);
  const timerId = useRef<number | null>(null);
  const fired = useRef(false);

  const clearTimer = () => {
    if (timerId.current) window.clearTimeout(timerId.current);
    timerId.current = null;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!enabled) return;
    if (event.pointerType === 'mouse') return;
    startX.current = event.clientX;
    startY.current = event.clientY;
    fired.current = false;
    clearTimer();
    timerId.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, delayMs);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (!enabled || !timerId.current) return;
    const dx = Math.abs(event.clientX - startX.current);
    const dy = Math.abs(event.clientY - startY.current);
    if (dx > moveThreshold || dy > moveThreshold) clearTimer();
  };

  const onPointerUp = (event: React.PointerEvent) => {
    if (!enabled) return;
    const moved =
      Math.abs(event.clientX - startX.current) > moveThreshold ||
      Math.abs(event.clientY - startY.current) > moveThreshold;
    const shouldTap = !fired.current && !moved;
    clearTimer();
    if (shouldTap) onTap?.();
  };

  const onPointerCancel = () => {
    clearTimer();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  };
}
