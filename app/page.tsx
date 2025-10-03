'use client';
import dynamic from 'next/dynamic';
import ChatSidebar from '@/components/ChatSidebar';
import ChatPane from '@/components/ChatPane';
import TopHeader from '@/components/TopHeader';
import MobileHeader from '@/components/MobileHeader';
const SettingsDrawer = dynamic(
  () => import(/* webpackPrefetch: true */ '@/components/SettingsDrawer'),
  { ssr: false },
);
const CompareDrawer = dynamic(
  () => import(/* webpackPrefetch: true */ '@/components/CompareDrawer'),
  { ssr: false },
);
const GlobalNotice = dynamic(() => import('@/components/GlobalNotice'), { ssr: false });
import { useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { useSidebarGestures } from '@/lib/hooks/useSidebarGestures';

export default function HomePage() {
  const initialize = useChatStore((s) => s.initializeApp);
  const { collapsed, isSettingsOpen, isCompareOpen } = useChatStore(
    (s) => ({
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      isCompareOpen: s.ui.compare?.isOpen ?? false,
    }),
    shallow,
  );
  const setUI = useChatStore((s) => s.setUI);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);
  useEffect(() => setMounted(true), []);
  // Ensure sidebar is collapsed on small screens so it doesn't cover content by default
  useEffect(() => {
    if (isMobile && !collapsed) setUI({ sidebarCollapsed: true });
  }, [isMobile]);
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Mobile: attach swipe gestures for sidebar open/close
  useSidebarGestures({
    isMobile: mounted && isMobile,
    collapsed,
    setCollapsed: (v) => setUI({ sidebarCollapsed: v }),
  });

  // Warm-up: prefetch drawer bundles on idle so first open feels instant
  useEffect(() => {
    const warm = () => {
      try {
        import('@/components/SettingsDrawer');
        import('@/components/CompareDrawer');
      } catch {}
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(warm);
    } else {
      // Small delay so it never competes with first paint
      const tid = setTimeout(warm, 300);
      return () => clearTimeout(tid);
    }
  }, []);

  return (
    <div className="app-shell" style={{ ['--sidebar-width' as any]: collapsed ? '0px' : '320px' }}>
      {/* Sidebar column (hidden via CSS on small screens) */}
      <aside
        className={`sidebar ${collapsed ? '' : 'glass-panel border border-border rounded-2xl p-2'}`}
      >
        {!collapsed && <ChatSidebar />}
      </aside>
      <main className="content">
        {isMobile ? <MobileHeader /> : <TopHeader />}
        <div className="flex-1 min-h-0">
          <ChatPane />
        </div>
        {isSettingsOpen && <SettingsDrawer />}
        {isCompareOpen && <CompareDrawer />}
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
