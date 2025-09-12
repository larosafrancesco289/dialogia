'use client';
import ModelPicker from '@/components/ModelPicker';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import ThemeToggle from '@/components/ThemeToggle';
import { Squares2X2Icon } from '@heroicons/react/24/outline';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';

export default function TopHeader() {
  // Use granular selectors to avoid unnecessary re-renders
  const { chats, selectedChatId, renameChat, setUI, openCompare, newChat } = useChatStore(
    (s) => ({
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      renameChat: s.renameChat,
      setUI: s.setUI,
      openCompare: s.openCompare,
      newChat: s.newChat,
    }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);
  const { collapsed, isSettingsOpen } = useChatStore(
    (s) => ({ collapsed: s.ui.sidebarCollapsed ?? false, isSettingsOpen: s.ui.showSettings }),
    shallow,
  );
  const [title, setTitle] = useState(chat?.title || '');
  useEffect(() => setTitle(chat?.title || ''), [chat?.id]);
  const save = useDebouncedCallback((text: string) => {
    if (!chat) return;
    const t = (text || '').trim();
    if (!t || t === chat.title) return;
    renameChat(chat.id, t);
  }, 400);

  return (
    <div className="app-header gap-3">
      <button
        className="btn btn-ghost shrink-0"
        aria-label="Toggle sidebar"
        onClick={() => setUI({ sidebarCollapsed: !collapsed })}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRightIcon className="h-5 w-5" />
        ) : (
          <ChevronLeftIcon className="h-5 w-5" />
        )}
      </button>
      {/* brand text not needed in unified header */}
      <div className="relative flex-1 min-w-0">
        <ModelPicker />
      </div>
      {chat && (
        <input
          className="input flex-1 min-w-0 max-w-full hidden sm:block"
          aria-label="Chat title"
          placeholder="Untitled chat"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            save(e.target.value);
          }}
          onBlur={() => save.flush(title)}
        />
      )}
      <div className="ml-auto" />
      {/* New Chat action, accessible even when sidebar is collapsed */}
      <button
        className="btn btn-ghost shrink-0"
        aria-label="New chat"
        title="New chat"
        onClick={() => newChat()}
      >
        <PlusIcon className="h-5 w-5" />
      </button>
      <div className="hide-on-mobile">
        <ThemeToggle />
      </div>
      <button
        className="btn btn-ghost hide-on-mobile"
        aria-label="Open compare"
        onClick={() => openCompare()}
        onMouseEnter={() => {
          try {
            import('@/components/CompareDrawer');
          } catch {}
        }}
        onFocus={() => {
          try {
            import('@/components/CompareDrawer');
          } catch {}
        }}
        title="Compare models"
      >
        <Squares2X2Icon className="h-5 w-5" />
      </button>
      <button
        className="btn btn-ghost hide-on-mobile"
        aria-label="Open settings"
        aria-pressed={isSettingsOpen}
        onClick={() => setUI({ showSettings: !isSettingsOpen })}
        onMouseEnter={() => {
          try {
            import('@/components/SettingsDrawer');
          } catch {}
        }}
        onFocus={() => {
          try {
            import('@/components/SettingsDrawer');
          } catch {}
        }}
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
