'use client';
import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { StopIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';

export default function Composer() {
  const send = useChatStore((s) => s.sendUserMessage);
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const stop = useChatStore((s) => s.stopStreaming);
  const updateSettings = useChatStore((s) => s.updateChatSettings);

  const onSend = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    // Keep the caret in the box so the user can continue typing immediately
    taRef.current?.focus();
    await send(value);
  };

  // Autofocus on mount and when chat changes or streaming stops
  useEffect(() => {
    taRef.current?.focus({ preventScroll: true } as any);
  }, []);
  useEffect(() => {
    taRef.current?.focus({ preventScroll: true } as any);
  }, [selectedChatId]);
  useEffect(() => {
    if (!isStreaming) taRef.current?.focus({ preventScroll: true } as any);
  }, [isStreaming]);

  useAutogrowTextarea(taRef, [text]);

  return (
    <div className="composer-chrome">
      <div className="flex items-center gap-3">
        <textarea
          ref={taRef}
          className="textarea flex-1 text-base"
          rows={1}
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (isStreaming) return; // allow typing while streaming, but do not send
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') onSend();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        {isStreaming ? (
          <button
            className="btn btn-outline self-center"
            onClick={() => {
              stop();
              setTimeout(() => taRef.current?.focus({ preventScroll: true } as any), 0);
            }}
            aria-label="Stop"
          >
            <StopIcon className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className={`btn self-center ${chat?.settings.search_with_brave ? 'btn-primary' : 'btn-outline'}`}
              onClick={() =>
                updateSettings({ search_with_brave: !chat?.settings.search_with_brave })
              }
              title="Use web search (Brave) to augment the next message"
              aria-label="Toggle Brave Search"
              aria-pressed={!!chat?.settings.search_with_brave}
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
            </button>
            <button
              className="btn btn-outline self-center"
              onClick={onSend}
              aria-label="Send"
              title="Send"
            >
              <PaperAirplaneIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {/* Simplified footer: remove model and hotkey hints for a cleaner composer */}
    </div>
  );
}
