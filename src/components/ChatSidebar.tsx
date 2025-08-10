"use client";
import { useEffect, useState } from "react";
import { useChatStore } from "@/lib/store";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

export default function ChatSidebar() {
  const {
    chats,
    selectedChatId,
    selectChat,
    newChat,
    renameChat,
    deleteChat,
    loadModels,
  } = useChatStore();
  const collapsed = useChatStore((s) => s.ui.sidebarCollapsed ?? false);
  const setUI = useChatStore((s) => s.setUI);
  const isSettingsOpen = useChatStore((s) => s.ui.showSettings);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Sidebar kept intentionally minimal/clean

  // Fill the aside; width is controlled by grid column in `app-shell`
  return (
    <div className={"h-full flex flex-col w-full"}>
      <div className="app-header bg-surface">
        <div className="font-semibold">{collapsed ? 'Dg' : 'Dialogia'}</div>
        <div className="flex items-center gap-2 ml-auto">
          <button
            className="btn btn-ghost"
            aria-label="Toggle settings"
            aria-pressed={isSettingsOpen}
            onClick={() => setUI({ showSettings: !isSettingsOpen })}
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 flex gap-2">
        <button className="btn w-full" onClick={() => newChat()}>{collapsed ? '+' : 'New Chat'}</button>
      </div>

      {!collapsed && <div className="px-4 text-xs text-muted-foreground">Chats</div>}
      <div className={`scroll-area ${collapsed ? 'px-2' : 'px-4'} pb-3 space-y-2 flex-1`}>
        {chats.map((c) => (
          <div key={c.id} className={`card p-3 cursor-pointer ${selectedChatId === c.id ? "ring-2 ring-primary" : ""}`}>
            {editingId === c.id ? (
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={async () => {
                    await renameChat(c.id, editTitle || c.title);
                    setEditingId(null);
                  }}
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2" onClick={() => selectChat(c.id)}>
                <div className="flex-1 truncate">{collapsed ? '•' : c.title}</div>
                {!collapsed && (
                  <>
                    <button className="btn btn-ghost" onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setEditTitle(c.title); }}>Rename</button>
                    <button className="btn btn-outline" onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }}>Delete</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

