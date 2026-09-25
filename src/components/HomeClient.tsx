import { useEffect, useRef, useState } from 'react';
import { ChatSidebar } from '@/components/sidebar/ChatSidebar';
import { ChatPane } from '@/components/chat/ChatPane';
import { TopHeader } from '@/components/TopHeader';
import { MobileShell } from '@/components/mobile/MobileShell';
import { ModuleSlot } from '@/components/ModuleSlot';
import { lazyClient } from '@/lib/ui/lazy';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useAppBootstrap } from '@/lib/hooks/useAppBootstrap';
import { useAmbientMotionPause } from '@/lib/hooks/useAmbientMotionPause';
import { selectIsTutorEnabled } from '@/lib/store/selectors';
import { selectRightPanelContent } from '@/lib/modules';
import { MotionConfig } from 'framer-motion';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import { preloadMarkdown } from '@/components/Markdown';

// How long after the page loads the side panels take their saved state without sliding.
const LOAD_SETTLE_MS = 1000;

const SettingsDrawer = lazyClient(() =>
  import(/* webpackPrefetch: true */ '@/components/settings/SettingsDrawer').then((mod) => ({
    default: mod.SettingsDrawer,
  })),
);
const GlobalNotice = lazyClient(() =>
  import('@/components/GlobalNotice').then((mod) => ({ default: mod.GlobalNotice })),
);
const SetupSheet = lazyClient(() =>
  import('@/components/SetupSheet').then((mod) => ({ default: mod.SetupSheet })),
);
const IntroTour = lazyClient(() =>
  import('@/components/intro/IntroTour').then((mod) => ({ default: mod.IntroTour })),
);

export function HomeClient() {
  const {
    collapsed,
    isSettingsOpen,
    isSetupOpen,
    isIntroOpen,
    tutorActive,
    rightPanelOpen,
    hasPlan,
    planSheetOverride,
    chatId,
  } = useChatStore(
    (s) => ({
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      isSetupOpen: s.ui.setupOpen === true,
      isIntroOpen: s.ui.introSeen !== true,
      tutorActive: selectIsTutorEnabled(s),
      rightPanelOpen: s.ui.plan?.rightPanelOpen ?? false,
      hasPlan: selectRightPanelContent(s),
      planSheetOverride: s.ui.plan?.sheetPlanOverride ?? null,
      chatId: s.selectedChatId ?? null,
    }),
    shallow,
  );
  const setUI = useChatStore((s) => s.setUI);
  const { isMobile } = useAppBootstrap();
  // In parallel with reading the saved chats, so the one you left renders
  // as soon as it arrives.
  useEffect(() => preloadMarkdown(), []);
  const sidePanelsCrowded = useMediaQuery(MEDIA_QUERIES.sidePanels);
  useAmbientMotionPause();

  // Track which chat has already auto-opened the panel (respect manual collapse)
  const autoOpenedChatIdRef = useRef<string | null>(null);

  // Auto-open right panel once per chat when a plan exists (desktop only)
  useEffect(() => {
    if (!chatId) {
      autoOpenedChatIdRef.current = null;
      return;
    }
    if (tutorActive && hasPlan && !isMobile && autoOpenedChatIdRef.current !== chatId) {
      autoOpenedChatIdRef.current = chatId;
      setUI({ plan: { rightPanelOpen: true } });
    }
  }, [chatId, tutorActive, hasPlan, isMobile, setUI]);

  // When the window is too narrow for both side panels, the one opened last
  // wins: opening the sidebar closes the right panel, and anything else (the
  // panel opening, the window shrinking) collapses the sidebar.
  const panelHasContent = hasPlan || !!planSheetOverride;
  const showRightPanel = rightPanelOpen && panelHasContent;
  // The side panels arrive with the saved state (a plan loads a moment after
  // the page): what is open on load appears open, and only a change after
  // that slides.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), LOAD_SETTLE_MS);
    return () => clearTimeout(id);
  }, []);
  const prevPanelsRef = useRef({ collapsed, showRightPanel });
  useEffect(() => {
    const prev = prevPanelsRef.current;
    prevPanelsRef.current = { collapsed, showRightPanel };
    if (isMobile || !sidePanelsCrowded || collapsed || !showRightPanel) return;
    if (prev.collapsed && prev.showRightPanel) setUI({ plan: { rightPanelOpen: false } });
    else setUI({ sidebarCollapsed: true });
  }, [collapsed, showRightPanel, sidePanelsCrowded, isMobile, setUI]);

  // Render mobile shell for small screens
  if (isMobile) {
    return (
      <MotionConfig reducedMotion="user">
        <MobileShell />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className={`app-shell${settled ? '' : ' is-settling'}`}>
        {/* Sidebar column */}
        <div className={`sidebar-slot${collapsed ? ' is-collapsed' : ''}`} aria-hidden={collapsed}>
          <aside className="sidebar sidebar-panel">
            <ChatSidebar />
          </aside>
        </div>
        <main className="content">
          <TopHeader />
          <div className="flex-1 min-h-0">
            <ChatPane />
          </div>
          {isSettingsOpen && <SettingsDrawer />}
          {/* The tour defers the setup sheet rather than stacking on it: a
              first-time visitor should meet one dialog, then the next. */}
          {isSetupOpen && !isIntroOpen && <SetupSheet />}
          {isIntroOpen && <IntroTour />}
          <GlobalNotice />
        </main>

        {/* Right panel — Learning Hub */}
        <div
          className={`right-panel-slot${showRightPanel ? '' : ' is-collapsed'}`}
          aria-hidden={!showRightPanel}
        >
          {/* Kept while it closes, so its content eases out with the slot. */}
          {panelHasContent && (
            <div className="right-panel-body">
              <ModuleSlot slot="rightPanel" />
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}
