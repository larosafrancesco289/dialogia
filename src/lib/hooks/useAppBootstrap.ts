import { useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { prefetchOnIdle } from '@/lib/ui/lazy';
import { MEDIA_QUERIES, maxWidthQuery } from '@/lib/ui/breakpoints';

export function useAppBootstrap(opts?: { mobileBreakpoint?: number }) {
  const { initializeApp, setUI, collapsed } = useChatStore(
    (s) => ({
      initializeApp: s.initializeApp,
      setUI: s.setUI,
      collapsed: s.ui.sidebarCollapsed ?? false,
    }),
    shallow,
  );

  const isMobile = useMediaQuery(
    opts?.mobileBreakpoint ? maxWidthQuery(opts.mobileBreakpoint) : MEDIA_QUERIES.tablet,
  );

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

  // The markdown renderer is lazy, so a reload shows raw text until its chunk
  // lands. Warming it on idle removes the flash without paying for it on boot.
  useEffect(
    () =>
      prefetchOnIdle(() => import('@/components/markdown/MarkdownRenderer'), { timeoutMs: 1500 }),
    [],
  );

  return { isMobile };
}
