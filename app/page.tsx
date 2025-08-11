'use client';
import ChatSidebar from '@/components/ChatSidebar';
import ChatPane from '@/components/ChatPane';
import SettingsDrawer from '@/components/SettingsDrawer';
import TopHeader from '@/components/TopHeader';
import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';

export default function HomePage() {
  const initialize = useChatStore((s) => s.initializeApp);
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);
  const isSettingsOpen = useChatStore((s) => s.ui.showSettings);
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app-shell" style={{ ['--sidebar-width' as any]: collapsed ? '0px' : '320px' }}>
      <aside className={`sidebar bg-surface ${collapsed ? '' : 'border-r border-border'}`}>
        <ChatSidebar />
      </aside>
      <main className="content">
        <TopHeader />
        <div className="flex-1 min-h-0">
          <ChatPane />
        </div>
        {isSettingsOpen && <SettingsDrawer />}
      </main>
    </div>
  );
}
