import { useEffect, useRef } from 'react';
import { getBackStack } from '@/lib/mobile/backStack';

/**
 * While `open`, the phone's Back closes this (drawer, sheet, settings page)
 * instead of leaving the app. `close` may change every render.
 */
export function useBackToClose(open: boolean, close: () => void, enabled = true) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!open || !enabled) return;
    return getBackStack().push(() => closeRef.current());
  }, [open, enabled]);
}
