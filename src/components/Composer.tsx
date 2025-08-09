"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/store";

export default function Composer() {
  const send = useChatStore((s) => s.sendUserMessage);
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);

  const onSend = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    await send(value);
  };

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [text]);

  return (
    <div className="p-3 sticky bottom-0 bg-surface">
      <div className="flex items-end gap-2">
        <textarea
          ref={taRef}
          className="input flex-1 min-h-10"
          rows={1}
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSend();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          disabled={isStreaming}
        />
        <button className="btn" onClick={onSend} disabled={isStreaming} aria-label="Send">
          {isStreaming ? "…" : "Send"}
        </button>
      </div>
      {chat && (
        <div className="text-xs text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
          <span>model:</span>
          <span className="badge">{chat.settings.model}</span>
          {chat.settings.temperature != null && <span>· temp {chat.settings.temperature}</span>}
          {chat.settings.top_p != null && <span>· top_p {chat.settings.top_p}</span>}
          {chat.settings.max_tokens != null && <span>· max_tokens {chat.settings.max_tokens}</span>}
        </div>
      )}
      <div className="text-xs text-muted-foreground mt-1">Ctrl/Cmd+Enter send · Shift+Enter newline</div>
    </div>
  );
}


