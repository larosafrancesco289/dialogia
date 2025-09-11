'use client';
import dynamic from 'next/dynamic';
import ChatSidebar from '@/components/ChatSidebar';
import ChatPane from '@/components/ChatPane';
import TopHeader from '@/components/TopHeader';
const SettingsDrawer = dynamic(() => import('@/components/SettingsDrawer'), { ssr: false });
const CompareDrawer = dynamic(() => import('@/components/CompareDrawer'), { ssr: false });
const GlobalNotice = dynamic(() => import('@/components/GlobalNotice'), { ssr: false });
import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';

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
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app-shell" style={{ ['--sidebar-width' as any]: collapsed ? '0px' : '320px' }}>
      <aside
        className={`sidebar ${collapsed ? '' : 'glass-panel border border-border rounded-2xl p-2'}`}
      >
        {!collapsed && <ChatSidebar />}
      </aside>
      <main className="content">
        <TopHeader />
        <div className="flex-1 min-h-0">
          <ChatPane />
        </div>
        {isSettingsOpen && <SettingsDrawer />}
        {isCompareOpen && <CompareDrawer />}
        <GlobalNotice />
      </main>
    </div>
  );
}
