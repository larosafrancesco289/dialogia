'use client';

import { useEffect, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { prefetchOnIdle } from '@/lib/ui/lazy';
import { MEDIA_QUERIES, maxWidthQuery } from '@/lib/ui/breakpoints';

export function useAppBootstrap(opts?: { mobileBreakpoint?: number; initialIsMobile?: boolean }) {
  const { initializeApp, setUI, collapsed } = useChatStore(
    (s) => ({
      initializeApp: s.initializeApp,
      setUI: s.setUI,
      collapsed: s.ui.sidebarCollapsed ?? false,
    }),
    shallow,
  );

  const [mounted, setMounted] = useState(false);
  const mediaIsMobile = useMediaQuery(
    opts?.mobileBreakpoint ? maxWidthQuery(opts.mobileBreakpoint) : MEDIA_QUERIES.tablet,
  );
  // Until the media query resolves after mount, fall back to the server's UA
  // hint so phones get the mobile shell on first paint instead of a desktop
  // layout flash.
  const isMobile = mounted ? mediaIsMobile : (opts?.initialIsMobile ?? mediaIsMobile);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    if (isMobile && !collapsed) setUI({ sidebarCollapsed: true });
  }, [isMobile, collapsed, setUI]);

  useEffect(
    () => prefetchOnIdle(() => import('@/components/settings/SettingsDrawer'), { timeoutMs: 1500 }),
    [],
  );

  return { mounted, isMobile };
}
