"use client";
import { useEffect, useRef } from "react";
import { useChatStore } from "@/lib/store";
import { Markdown } from "@/lib/markdown";

export default function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((s) => s.messages[chatId] ?? []);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  return (
    <div className="scroll-area p-4 space-y-3 h-full" style={{ background: "var(--color-canvas)" }}>
      {messages.map((m) => (
        <div key={m.id} className={`card p-4`}>
          {m.role === "assistant" ? (
            <Markdown content={m.content} />
          ) : (
            <pre className="whitespace-pre-wrap">{m.content}</pre>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}


