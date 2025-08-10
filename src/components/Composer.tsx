"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/store";
import { StopIcon } from "@heroicons/react/24/outline";

export default function Composer() {
  const send = useChatStore((s) => s.sendUserMessage);
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const stop = useChatStore((s) => s.stopStreaming);

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
    <div className="p-5 sticky bottom-0 bg-surface">
      <div className="flex items-end gap-3">
        <textarea
          ref={taRef}
          className="input flex-1 min-h-14 text-base"
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
        {isStreaming ? (
          <button className="btn btn-outline" onClick={stop} aria-label="Stop">
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <button className="btn" onClick={onSend} aria-label="Send">Send</button>
        )}
      </div>
      {/* Simplified footer: remove model and hotkey hints for a cleaner composer */}
    </div>
  );
}


