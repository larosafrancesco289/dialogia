"use client";
import ChatSidebar from "@/components/ChatSidebar";
import ChatPane from "@/components/ChatPane";
import TopHeader from "@/components/TopHeader";
import { useEffect } from "react";
import { useChatStore } from "@/lib/store";

export default function HomePage() {
  const initialize = useChatStore((s) => s.initializeApp);
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="app-shell" style={{ ['--sidebar-width' as any]: collapsed ? '56px' : '320px' }}>
      <aside className="sidebar border-r border-border bg-surface">
        <ChatSidebar />
      </aside>
      <main className="content">
        <TopHeader />
        <ChatPane />
      </main>
    </div>
  );
}


