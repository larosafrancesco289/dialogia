"use client";
import ModelPicker from "@/components/ModelPicker";
import { useChatStore } from "@/lib/store";

export default function TopHeader() {
  const { chats, selectedChatId, renameChat, setUI } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);

  return (
    <div className="border-b border-border px-4 py-3 flex items-center gap-3">
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


