'use client';

import { useEffect } from 'react';

/**
 * Toggles a `tab-hidden` class on the document root while the tab is in the
 * background so always-on ambient animations (blurred gradients, shimmers)
 * stop burning GPU/battery when nobody is looking.
 */
export function useAmbientMotionPause() {
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.classList.toggle('tab-hidden', document.visibilityState === 'hidden');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.classList.remove('tab-hidden');
    };
  }, []);
}
