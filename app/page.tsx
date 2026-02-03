'use client';
import { ChatSidebar } from '@/components/sidebar/ChatSidebar';
import { ChatPane } from '@/components/chat/ChatPane';
import { TopHeader } from '@/components/TopHeader';
import { MobileHeader } from '@/components/MobileHeader';
import { MobileShell } from '@/components/mobile/MobileShell';
import { FreeTierBanner } from '@/components/FreeTierBanner';
import { lazyClient } from '@/lib/ui/lazy';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useSidebarGestures } from '@/lib/hooks/useSidebarGestures';
import { useAppBootstrap } from '@/lib/hooks/useAppBootstrap';
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

export default function HomePage() {
  const { collapsed, isSettingsOpen } = useChatStore(
    (s) => ({
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
    }),
    shallow,
  );
  const setUI = useChatStore((s) => s.setUI);
  const { mounted, isMobile } = useAppBootstrap({ mobileBreakpoint: 768 });

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

  return (
    <div className="app-shell">
      {/* Sidebar column - uses translateX for GPU-accelerated smoothness */}
      <motion.div
        className="sidebar-slot"
        initial={false}
        animate={{ width: collapsed ? 0 : 320 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
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
        {isMobile ? <MobileHeader /> : <TopHeader />}
        <FreeTierBanner />
        <div className="flex-1 min-h-0">
          <ChatPane />
        </div>
        {isSettingsOpen && <SettingsDrawer />}
        <GlobalNotice />
      </main>
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
