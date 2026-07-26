'use client';
import { useEffect, useRef } from 'react';
import { ChatSidebar } from '@/components/sidebar/ChatSidebar';
import { ChatPane } from '@/components/chat/ChatPane';
import { TopHeader } from '@/components/TopHeader';
import { MobileShell } from '@/components/mobile/MobileShell';
import { FreeTierBanner } from '@/components/FreeTierBanner';
import { ModuleSlot } from '@/components/ModuleSlot';
import { lazyClient } from '@/lib/ui/lazy';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useSidebarGestures } from '@/lib/hooks/useSidebarGestures';
import { useAppBootstrap } from '@/lib/hooks/useAppBootstrap';
import { useAmbientMotionPause } from '@/lib/hooks/useAmbientMotionPause';
import { selectCurrentChat, selectIsTutorEnabled } from '@/lib/store/selectors';
import { MotionConfig } from 'framer-motion';

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
      hasPlan: !!selectCurrentChat(s)?.settings?.features.tutor?.learningPlan,
      planSheetOverride: s.ui.plan?.sheetPlanOverride ?? null,
      chatId: s.selectedChatId ?? null,
    }),
    shallow,
  );
  const setUI = useChatStore((s) => s.setUI);
  const { isMobile } = useAppBootstrap({ mobileBreakpoint: 768 });
  useAmbientMotionPause();

  // Track which chat has already auto-opened the panel (respect manual collapse)
  const autoOpenedChatIdRef = useRef<string | null>(null);

  // Auto-collapse sidebar when tutor activates (desktop only)
  useEffect(() => {
    if (tutorActive && !isMobile) setUI({ sidebarCollapsed: true });
  }, [tutorActive, isMobile, setUI]);

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

  // Mobile: attach swipe gestures for sidebar open/close
  useSidebarGestures({
    isMobile,
    collapsed,
    setCollapsed: (v) => setUI({ sidebarCollapsed: v }),
  });

  // Render mobile shell for small screens
  if (isMobile) {
    return (
      <MotionConfig reducedMotion="user">
        <MobileShell />
      </MotionConfig>
    );
  }

  const hasRightPanelContent = hasPlan || !!planSheetOverride;
  const showRightPanel = rightPanelOpen && hasRightPanelContent;

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        {/* Sidebar column */}
        <div className={`sidebar-slot${collapsed ? ' is-collapsed' : ''}`} aria-hidden={collapsed}>
          <aside className="sidebar glass-panel border border-border rounded-2xl p-2">
            <ChatSidebar />
          </aside>
        </div>
        <main className="content">
          <TopHeader />
          <FreeTierBanner />
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
          {showRightPanel && (
            <div className="right-panel-body">
              <ModuleSlot slot="rightPanel" />
            </div>
          )}
        </div>

        {/* Mobile sidebar overlay */}
        {isMobile && !collapsed && (
          <>
            <button
              className="fixed inset-0 z-[75] settings-overlay"
              aria-label="Close sidebar"
              onClick={() => setUI({ sidebarCollapsed: true })}
            />
            <div className="fixed inset-y-0 left-0 z-[80] w-[96%] max-w-[420px] p-2">
              <div className="glass-panel border border-border rounded-2xl p-3 h-full overflow-hidden">
                <ChatSidebar />
              </div>
            </div>
          </>
        )}
      </div>
    </MotionConfig>
  );
}
