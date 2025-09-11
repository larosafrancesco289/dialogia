'use client';
import ModelPicker from '@/components/ModelPicker';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import ThemeToggle from '@/components/ThemeToggle';
import { Squares2X2Icon } from '@heroicons/react/24/outline';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useEffect, useState } from 'react';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';

export default function TopHeader() {
  // Use granular selectors to avoid unnecessary re-renders
  const { chats, selectedChatId, renameChat, setUI, openCompare } = useChatStore(
    (s) => ({
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      renameChat: s.renameChat,
      setUI: s.setUI,
      openCompare: s.openCompare,
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
        className="btn btn-ghost"
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
      <div className="relative">
        <ModelPicker />
      </div>
      {chat && (
        <input
          className="input flex-1 max-w-xl"
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
      <ThemeToggle />
      <button
        className="btn btn-ghost"
        aria-label="Open compare"
        onClick={() => openCompare()}
        title="Compare models"
      >
        <Squares2X2Icon className="h-5 w-5" />
      </button>
      <button
        className="btn btn-ghost"
        aria-label="Open settings"
        aria-pressed={isSettingsOpen}
        onClick={() => setUI({ showSettings: !isSettingsOpen })}
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
