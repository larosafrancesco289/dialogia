"use client";
import ModelPicker from "@/components/ModelPicker";
import { useChatStore } from "@/lib/store";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

export default function TopHeader() {
  const { chats, selectedChatId, renameChat, setUI } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);

  return (
    <div className="app-header bg-surface gap-3">
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
      <button className="btn btn-outline" onClick={() => setUI({ showSettings: true })}>Settings</button>
    </div>
  );
}


