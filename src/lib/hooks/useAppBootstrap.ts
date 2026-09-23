import { useEffect, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { prefetchOnIdle } from '@/lib/ui/lazy';
import { MEDIA_QUERIES, maxWidthQuery } from '@/lib/ui/breakpoints';

export function useAppBootstrap(opts?: { mobileBreakpoint?: number }) {
  const { initializeApp, loadModels, setUI, collapsed } = useChatStore(
    (s) => ({
      initializeApp: s.initializeApp,
      loadModels: s.loadModels,
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

  // The model list (and, with nothing configured, the Connect a model sheet)
  // comes up with the app on every layout. It used to ride on the desktop
  // sidebar, so phones only loaded models once Chats or Settings opened.
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // A narrow window folds the sidebar away; widening it again brings back
  // the sidebar the reader had, instead of leaving it folded for good.
  const reopenSidebarRef = useRef(false);
  useEffect(() => {
    if (isMobile && !collapsed) {
      reopenSidebarRef.current = true;
      setUI({ sidebarCollapsed: true });
    } else if (!isMobile && reopenSidebarRef.current) {
      reopenSidebarRef.current = false;
      if (collapsed) setUI({ sidebarCollapsed: false });
    }
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
