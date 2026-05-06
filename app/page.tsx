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
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { motionTransition, motionVariants } from '@/lib/ui/motion';

const SettingsDrawer = lazyClient(() =>
  import(/* webpackPrefetch: true */ '@/components/settings/SettingsDrawer').then((mod) => ({
    default: mod.SettingsDrawer,
  })),
);
const GlobalNotice = lazyClient(() =>
  import('@/components/GlobalNotice').then((mod) => ({ default: mod.GlobalNotice })),
);

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
    <LayoutGroup>
      <motion.div className="app-shell" layout transition={motionTransition.layout}>
        {/* Sidebar column */}
        <motion.div
          className="sidebar-slot"
          layout
          initial={false}
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={motionTransition.layout}
          style={{ width: collapsed ? 0 : 320 }}
          aria-hidden={collapsed}
        >
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.aside
                className="sidebar glass-panel border border-border rounded-2xl p-2"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={motionVariants.panelLeft}
                style={{ width: 320 }}
              >
                <ChatSidebar />
              </motion.aside>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.main className="content" layout transition={motionTransition.layout}>
          <TopHeader />
          <FreeTierBanner />
          <div className="flex-1 min-h-0">
            <ChatPane />
          </div>
          {isSettingsOpen && <SettingsDrawer />}
          <GlobalNotice />
        </motion.main>

        {/* Right panel — Learning Hub */}
        <motion.div
          className="right-panel-slot"
          layout
          initial={false}
          animate={{ opacity: showRightPanel ? 1 : 0 }}
          transition={motionTransition.layout}
          style={{ width: showRightPanel ? 400 : 0 }}
          aria-hidden={!showRightPanel}
        >
          <AnimatePresence initial={false}>
            {showRightPanel && (
              <motion.div
                style={{ width: 400, height: '100%' }}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={motionVariants.panelRight}
              >
                <LearningPanel />
              </motion.div>
            )}
          </AnimatePresence>
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
      </motion.div>
    </LayoutGroup>
  );
}
