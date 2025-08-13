'use client';
import ModelPicker from '@/components/ModelPicker';
import { useChatStore } from '@/lib/store';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import ThemeToggle from '@/components/ThemeToggle';
import { Cog6ToothIcon } from '@heroicons/react/24/outline';

export default function TopHeader() {
  const { chats, selectedChatId, renameChat, setUI } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);
  const isSettingsOpen = useChatStore((s) => s.ui.showSettings);

  return (
    <div className="app-header gap-3">
      <button
        className="btn btn-ghost"
        aria-label="Toggle sidebar"
        onClick={() => setUI({ sidebarCollapsed: !collapsed })}
      >
        {collapsed ? (
          <ChevronRightIcon className="h-5 w-5" />
        ) : (
          <ChevronLeftIcon className="h-5 w-5" />
        )}
      </button>
      <div className="relative">
        <ModelPicker />
      </div>
      {chat && (
        <input
          className="input flex-1 max-w-xl"
          value={chat.title}
          onChange={(e) => renameChat(chat.id, e.target.value)}
        />
      )}
      <div className="ml-auto" />
      <ThemeToggle />
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
