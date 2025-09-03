'use client';
import ChatSidebar from '@/components/ChatSidebar';
import ChatPane from '@/components/ChatPane';
import SettingsDrawer from '@/components/SettingsDrawer';
import CompareDrawer from '@/components/CompareDrawer';
import TopHeader from '@/components/TopHeader';
import GlobalNotice from '@/components/GlobalNotice';
import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';

export default function HomePage() {
  const initialize = useChatStore((s) => s.initializeApp);
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);
  const isSettingsOpen = useChatStore((s) => s.ui.showSettings);
  const isCompareOpen = useChatStore((s) => s.ui.compare?.isOpen ?? false);
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
