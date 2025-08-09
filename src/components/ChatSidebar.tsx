"use client";
import { useEffect, useMemo, useState } from "react";
import { useChatStore } from "@/lib/store";
import ThemeToggle from "@/components/ThemeToggle";
import { exportAll, importAll } from "@/lib/db";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const onExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dialogia-export-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      await importAll(data);
      location.reload();
    };
    input.click();
  };

  // Fill the aside; width is controlled by grid column in `app-shell`
  return (
    <div className={"h-full flex flex-col w-full"}>
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="font-semibold">{collapsed ? 'Dg' : 'Dialogia'}</div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost" aria-label="Toggle sidebar" onClick={() => setUI({ sidebarCollapsed: !collapsed })}>{collapsed ? '→' : '←'}</button>
          {!collapsed && <ThemeToggle />}
        </div>
      </div>

      <div className="p-3 flex gap-2">
        <button className="btn w-full" onClick={() => newChat()}>{collapsed ? '+' : 'New Chat'}</button>
      </div>

      {!collapsed && <div className="px-3 text-xs text-muted-foreground">Chats</div>}
      <div className={`scroll-area ${collapsed ? 'px-1' : 'px-3'} pb-3 space-y-2 flex-1`}>
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

      {!collapsed && (
        <div className="p-3 border-t border-border space-y-3">
          <div className="flex gap-2">
            <button className="btn btn-outline flex-1" onClick={onExport}>Export</button>
            <button className="btn btn-outline flex-1" onClick={onImport}>Import</button>
          </div>
          <div className="flex gap-2">
            <EnvKeyNotice />
          </div>
          <p className="text-xs text-muted-foreground">Local-only. No analytics. Prompts are not logged by default on OpenRouter.</p>
        </div>
      )}
    </div>
  );
}

function EnvKeyNotice() {
  const hasKey = Boolean(process.env.NEXT_PUBLIC_OPENROUTER_API_KEY);
  if (hasKey) return null;
  return <div className="badge w-full justify-center">Missing NEXT_PUBLIC_OPENROUTER_API_KEY</div>;
}


