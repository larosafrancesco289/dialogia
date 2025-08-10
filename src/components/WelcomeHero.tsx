"use client";
import { useEffect, useRef, useState } from "react";
import { useChatStore } from "@/lib/store";

export default function WelcomeHero() {
  const [query, setQuery] = useState("");
  const newChat = useChatStore((s) => s.newChat);
  const send = useChatStore((s) => s.sendUserMessage);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const start = async () => {
    await newChat();
    const value = query.trim();
    if (value) await send(value);
    setQuery("");
  };

  // Auto-grow textarea height similar to the Composer
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [query]);

  return (
    <div className="h-full flex items-center justify-center relative">
      <div className="absolute inset-0 hero-gradient pointer-events-none" />
      <div className="relative z-10 w-full max-w-3xl px-6 text-center space-y-6">
        <div className="text-3xl sm:text-4xl font-semibold">Welcome to Dialogia</div>
        <p className="text-sm text-muted-foreground">Ask anything. Your prompts stay local, and you control the model.</p>
        <div className="card p-2 flex items-center gap-2">
          <textarea
            ref={taRef}
            className="textarea flex-1 text-base"
            rows={1}
            placeholder="Ask anything"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                start();
              }
            }}
          />
          <button className="btn self-center" onClick={start} aria-label="Go">Send</button>
        </div>
        <div className="text-xs text-muted-foreground">Press Enter to start · Shift+Enter for newline</div>
      </div>
    </div>
  );
}


