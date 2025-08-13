'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

export default function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((s) => s.messages[chatId] ?? []);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const models = useChatStore((s) => s.models);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const regenerate = useChatStore((s) => s.regenerateAssistantMessage);
  const showStats = chat?.settings.show_stats ?? true;
  const endRef = useRef<HTMLDivElement>(null);
  // Scroll when a new message is added
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);
  // Also keep scrolling during streaming as content grows
  const lastLen =
    (messages[messages.length - 1]?.content?.length ?? 0) +
    (messages[messages.length - 1]?.reasoning?.length ?? 0);
  useEffect(() => {
    if (isStreaming) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastLen, isStreaming]);
  const showByDefault = chat?.settings.show_thinking_by_default ?? true;
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpandedReasoningIds((s) => ({ ...s, [id]: !s[id] }));
  const isExpanded = (id: string) => expandedReasoningIds[id] ?? showByDefault;
  return (
    <div className="scroll-area p-4 space-y-3 h-full" style={{ background: 'var(--color-canvas)' }}>
      {messages.map((m) => (
        <div key={m.id} className={`card p-0 message-card`}>
          {m.role === 'assistant' ? (
            <div className="relative">
              <div className="absolute top-2 right-2 z-30">
                <RegenerateMenu onChoose={(modelId) => regenerate(m.id, { modelId })} />
              </div>
              {/* Thinking header with shimmer and toggle if reasoning exists or streaming */}
              {typeof m.reasoning === 'string' && m.reasoning.length > 0 && (
                <div className="px-4 pt-3 pb-1">
                  <button className="btn btn-ghost text-xs" onClick={() => toggle(m.id)}>
                    {isExpanded(m.id) ? 'Hide thinking' : 'Show thinking'}
                  </button>
                </div>
              )}
              {typeof m.reasoning === 'string' && m.reasoning.length > 0 && isExpanded(m.id) && (
                <div className="px-4 pb-2 mt-2">
                  <div className="thinking-panel">
                    <pre className="whitespace-pre-wrap text-sm opacity-90 leading-relaxed">{m.reasoning}</pre>
                    <div className="thinking-shimmer" aria-hidden />
                  </div>
                </div>
              )}
              <div className="p-4 pt-3">
                <Markdown content={m.content} />
              </div>
              <div className="px-4 pb-3 -mt-2">
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const modelId = m.model || chat?.settings.model || 'unknown';
                    const modelInfo = models.find((x) => x.id === modelId);
                    const currency = modelInfo?.pricing?.currency || 'USD';
                    const promptRate = modelInfo?.pricing?.prompt; // per 1M tokens
                    const completionRate = modelInfo?.pricing?.completion; // per 1M tokens
                    let cost: string | undefined;
                    let ctxPct: number | undefined;
                    if (showStats && m.metrics) {
                      const pt = m.metrics.promptTokens ?? m.tokensIn;
                      const ct = m.metrics.completionTokens ?? m.tokensOut;
                      const pCost =
                        promptRate != null && pt != null ? (promptRate / 1_000_000) * pt : 0;
                      const cCost =
                        completionRate != null && ct != null
                          ? (completionRate / 1_000_000) * ct
                          : 0;
                      const total = pCost + cCost;
                      cost = total > 0 ? `${currency} ${total.toFixed(5)}` : undefined;

                      // Compute context window fullness based on model context and reserved completion tokens
                      const contextLimit = modelInfo?.context_length ?? 8000;
                      const reservedForCompletion =
                        typeof chat?.settings.max_tokens === 'number'
                          ? chat.settings.max_tokens!
                          : 1024;
                      const maxPromptTokens = Math.max(512, contextLimit - reservedForCompletion);
                      if (pt != null && maxPromptTokens > 0) {
                        ctxPct = Math.max(
                          0,
                          Math.min(100, Math.round((pt / maxPromptTokens) * 100)),
                        );
                      }
                    }
                    return (
                      <>
                        Generated by <span className="badge">{modelId}</span>
                        {showStats && m.metrics && (
                          <>
                            <span> · TTFT {m.metrics.ttftMs ?? '–'} ms</span>
                            {m.metrics.promptTokens != null && (
                              <span> · in {m.metrics.promptTokens}</span>
                            )}
                            {m.metrics.completionTokens != null && (
                              <span> · out {m.metrics.completionTokens}</span>
                            )}
                            {m.metrics.tokensPerSec != null && (
                              <span> · {m.metrics.tokensPerSec} tok/s</span>
                            )}
                            {ctxPct != null && (
                              <span title="Context window fullness"> · ctx {ctxPct}%</span>
                            )}
                            {cost && <span> · {cost}</span>}
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <Markdown content={m.content} />
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function RegenerateMenu({ onChoose }: { onChoose: (modelId?: string) => void }) {
  const { chats, selectedChatId, ui } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const { favoriteModelIds } = useChatStore();
  const curated = [
    { id: chat?.settings.model || 'openai/gpt-5-chat', name: 'Current' },
    { id: 'openai/gpt-5-chat', name: 'GPT-5' },
    { id: 'moonshotai/kimi-k2', name: 'Kimi K2' },
    { id: 'x-ai/grok-4', name: 'Grok 4' },
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  ];
  const customOptions = (favoriteModelIds || []).map((id) => ({ id, name: id }));
  const options = [...curated, ...customOptions].reduce((acc: any[], m: any) => {
    if (!acc.find((x) => x.id === m.id)) acc.push(m);
    return acc;
  }, []);
  return (
    <div className="relative">
      <button
        className="icon-button"
        aria-label="Regenerate"
        title="Regenerate"
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowPathIcon className="h-4 w-4" />
      </button>
      {open && (
              <div className="absolute right-0 top-full mt-2 z-40 card p-2 w-56 popover">
          <div className="text-xs text-muted-foreground px-1 pb-1">Choose model</div>
          {options.map((o) => (
                  <div key={o.id} className="menu-item text-sm" onClick={() => {
                onChoose(o.id);
                setOpen(false);
              }}
                  >
              {o.name || o.id}
            </div>
          ))}
          <div className="border-t border-border my-1" />
          <div className="flex gap-1">
            <input
              className="input flex-1"
              placeholder="provider/model-id"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <button
              className="btn btn-outline"
              onClick={() => {
                const id = custom.trim();
                onChoose(id || undefined);
                setOpen(false);
              }}
            >
              Go
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
