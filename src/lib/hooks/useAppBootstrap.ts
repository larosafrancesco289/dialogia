import { useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { prefetchOnIdle } from '@/lib/ui/lazy';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';

export function useAppBootstrap() {
  const { initializeApp, loadModels, setUI, collapsed, foldedByLayout } = useChatStore(
    (s) => ({
      initializeApp: s.initializeApp,
      loadModels: s.loadModels,
      setUI: s.setUI,
      collapsed: s.ui.sidebarCollapsed ?? false,
      foldedByLayout: s.ui.sidebarFoldedByLayout === true,
    }),
    shallow,
  );

  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  // The model list comes up with the app on every layout. It used to ride on
  // the desktop sidebar, so phones only loaded models once Chats or Settings
  // opened.
  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  // A narrow window folds the sidebar away; widening it again brings back
  // the sidebar the reader had, instead of leaving it folded for good. The
  // mark lives in the store so the fold is never saved as the reader's choice.
  useEffect(() => {
    if (isMobile && !collapsed) {
      setUI({ sidebarCollapsed: true, sidebarFoldedByLayout: true });
    } else if (!isMobile && foldedByLayout) {
      setUI({ sidebarCollapsed: false, sidebarFoldedByLayout: false });
    }
  }, [isMobile, collapsed, foldedByLayout, setUI]);

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
