'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { StopIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { useAutogrowTextarea } from '@/lib/hooks/useAutogrowTextarea';
import ReasoningEffortMenu from '@/components/ReasoningEffortMenu';
import { estimateTokens } from '@/lib/tokenEstimate';
import { computeCost } from '@/lib/cost';
import { findModelById } from '@/lib/models';

export default function Composer() {
  const send = useChatStore((s) => s.sendUserMessage);
  const { chats, selectedChatId } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const models = useChatStore((s) => s.models);
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const stop = useChatStore((s) => s.stopStreaming);
  const updateSettings = useChatStore((s) => s.updateChatSettings);
  const setUI = useChatStore((s) => s.setUI);

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

  // Lightweight, live prompt token and cost estimate
  const tokenAndCost = useMemo(() => {
    const promptTokens = estimateTokens(text) || 0;
    const modelMeta = findModelById(models, chat?.settings.model);
    const cost = computeCost({ model: modelMeta, promptTokens });
    return { promptTokens, currency: cost.currency, total: cost.total };
  }, [text, chat?.settings.model, models]);

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
            {/* Show reasoning effort picker only for reasoning-capable models */}
            <ReasoningEffortMenu />
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
      {/* Helper chips row: current model, reasoning, web search, token estimate */}
      <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
        {chat && (
          <button
            className="badge"
            title="Change model (opens Settings)"
            onClick={() => setUI({ showSettings: true })}
          >
            {findModelById(models, chat.settings.model)?.name || chat.settings.model}
          </button>
        )}
        {chat && (
          <button
            className="badge"
            title="Toggle Brave web search for next message"
            onClick={() => updateSettings({ search_with_brave: !chat?.settings.search_with_brave })}
            aria-pressed={!!chat?.settings.search_with_brave}
          >
            {chat?.settings.search_with_brave ? 'Web search: On' : 'Web search: Off'}
          </button>
        )}
        {chat?.settings.reasoning_effort && (
          <span className="badge" title="Reasoning effort for this chat">
            Reasoning: {chat.settings.reasoning_effort}
          </span>
        )}
        {tokenAndCost.promptTokens > 0 && (
          <span className="badge" title="Approximate tokens and prompt cost">
            ≈ {tokenAndCost.promptTokens} tok
            {tokenAndCost.total != null ? ` · ${tokenAndCost.currency} ${tokenAndCost.total.toFixed(5)}` : ''}
          </span>
        )}
        <span className="text-xs text-muted-foreground">Press Enter to send · Shift+Enter for newline</span>
      </div>
    </div>
  );
}
