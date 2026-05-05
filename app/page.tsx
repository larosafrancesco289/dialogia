'use client';
import { useEffect, useRef } from 'react';
import { ChatSidebar } from '@/components/sidebar/ChatSidebar';
import { ChatPane } from '@/components/chat/ChatPane';
import { TopHeader } from '@/components/TopHeader';
import { MobileShell } from '@/components/mobile/MobileShell';
import { FreeTierBanner } from '@/components/FreeTierBanner';
import { LearningPanel } from '@/components/learning-panel/LearningPanel';
import { lazyClient } from '@/lib/ui/lazy';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useSidebarGestures } from '@/lib/hooks/useSidebarGestures';
import { useAppBootstrap } from '@/lib/hooks/useAppBootstrap';
import { selectCurrentChat, selectIsTutorEnabled } from '@/lib/store/selectors';
import { motion } from 'framer-motion';
import { springs } from '@/lib/mobile/springConfig';

const SettingsDrawer = lazyClient(() =>
  import(/* webpackPrefetch: true */ '@/components/settings/SettingsDrawer').then((mod) => ({
    default: mod.SettingsDrawer,
  })),
);
const GlobalNotice = lazyClient(() =>
  import('@/components/GlobalNotice').then((mod) => ({ default: mod.GlobalNotice })),
);

const PANEL_WIDTH_TRANSITION = { duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] } as const;

export default function HomePage() {
  const {
    collapsed,
    isSettingsOpen,
    tutorActive,
    rightPanelOpen,
    hasPlan,
    planSheetOverride,
    chatId,
  } = useChatStore(
    (s) => ({
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      tutorActive: selectIsTutorEnabled(s),
      rightPanelOpen: s.ui.plan.rightPanelOpen ?? false,
      hasPlan: !!selectCurrentChat(s)?.settings?.features.tutor.learningPlan,
      planSheetOverride: s.ui.plan.sheetPlanOverride ?? null,
      chatId: s.selectedChatId ?? null,
    }),
    shallow,
  );
  const setUI = useChatStore((s) => s.setUI);
  const { mounted, isMobile } = useAppBootstrap({ mobileBreakpoint: 768 });

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
    isMobile: mounted && isMobile,
    collapsed,
    setCollapsed: (v) => setUI({ sidebarCollapsed: v }),
  });

  // Render mobile shell for small screens
  if (mounted && isMobile) {
    return <MobileShell />;
  }

  const showRightPanel = rightPanelOpen && (hasPlan || !!planSheetOverride);

  return (
    <div className="app-shell">
      {/* Sidebar column */}
      <motion.div
        className="sidebar-slot"
        initial={false}
        animate={{ width: collapsed ? 0 : 320 }}
        transition={PANEL_WIDTH_TRANSITION}
      >
        <motion.aside
          className="sidebar glass-panel border border-border rounded-2xl p-2"
          initial={false}
          animate={{ x: collapsed ? -320 : 0 }}
          transition={springs.smooth}
          style={{ width: 320 }}
        >
          <ChatSidebar />
        </motion.aside>
      </motion.div>
      <main className="content">
        <TopHeader />
        <FreeTierBanner />
        <div className="flex-1 min-h-0">
          <ChatPane />
        </div>
        {isSettingsOpen && <SettingsDrawer />}
        <GlobalNotice />
      </main>

      {/* Right panel — Learning Hub */}
      <motion.div
        className="right-panel-slot"
        initial={false}
        animate={{ width: showRightPanel ? 400 : 0 }}
        transition={PANEL_WIDTH_TRANSITION}
      >
        <motion.div
          style={{ width: 400, height: '100%' }}
          initial={false}
          animate={{ x: showRightPanel ? 0 : 400 }}
          transition={springs.smooth}
        >
          <LearningPanel />
        </motion.div>
      </motion.div>

      {/* Mobile sidebar overlay */}
      {mounted && isMobile && !collapsed && (
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
  );
}
