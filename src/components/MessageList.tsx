'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import { ArrowPathIcon, ChevronDownIcon, ChevronUpIcon, PencilSquareIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import RegenerateMenu from '@/components/RegenerateMenu';

export default function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((s) => s.messages[chatId] ?? []);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const models = useChatStore((s) => s.models);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const braveByMessageId = useChatStore((s) => s.ui.braveByMessageId || {});
  const regenerate = useChatStore((s) => s.regenerateAssistantMessage);
  const showStats = chat?.settings.show_stats ?? true;
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);

  // Track whether user is near the bottom to enable smart autoscroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 100; // px
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
      setAtBottom(nearBottom);
      if (nearBottom) setShowJump(false);
    };
    // Initialize state in case content already overflows
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => el.removeEventListener('scroll', onScroll as any);
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    endRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  // Scroll when a new message is added, but only if at bottom or if user sent the last message
  useEffect(() => {
    const last = messages[messages.length - 1];
    const lastRole = last?.role;
    if (messages.length === 0) return;
    if (atBottom || lastRole === 'user') {
      scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
    } else {
      setShowJump(true);
    }
  }, [messages.length]);
  // Also keep scrolling during streaming as content grows
  const lastLen =
    (messages[messages.length - 1]?.content?.length ?? 0) +
    (messages[messages.length - 1]?.reasoning?.length ?? 0);
  const lastScrollTsRef = useRef(0);
  useEffect(() => {
    if (isStreaming && atBottom) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastScrollTsRef.current > 160) {
        // During streaming, avoid smooth animation to reduce jitter
        scrollToBottom('auto');
        lastScrollTsRef.current = now;
      }
    }
    if (!isStreaming) lastScrollTsRef.current = 0;
  }, [lastLen, isStreaming, atBottom]);
  const showByDefault = chat?.settings.show_thinking_by_default ?? true;
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpandedReasoningIds((s) => ({ ...s, [id]: !s[id] }));
  const isExpanded = (id: string) => expandedReasoningIds[id] ?? showByDefault;
  const [expandedSourcesIds, setExpandedSourcesIds] = useState<Record<string, boolean>>({});
  const toggleSources = (id: string) => setExpandedSourcesIds((s) => ({ ...s, [id]: !s[id] }));
  const isSourcesExpanded = (id: string) => expandedSourcesIds[id] ?? true;
  const editUserMessage = useChatStore((s) => s.editUserMessage);
  const editAssistantMessage = useChatStore((s) => s.editAssistantMessage);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const saveEdit = (messageId: string) => {
    const text = draft.trim();
    if (!text) return;
    // Exit edit mode immediately for responsive UX
    const payload = draft;
    setEditingId(null);
    setDraft('');
    // Dispatch to appropriate editor depending on role
    const role = messages.find((mm) => mm.id === messageId)?.role;
    if (role === 'assistant') {
      editAssistantMessage(messageId, payload).catch(() => void 0);
    } else {
      // Fire-and-forget; store will kick off regeneration for user messages
      editUserMessage(messageId, payload, { rerun: true }).catch(() => void 0);
    }
  };
  return (
    <div
      ref={containerRef}
      className="scroll-area p-4 space-y-3 h-full"
      style={{ background: 'var(--color-canvas)' }}
    >
      {messages.map((m) => (
        <div key={m.id} className={`card p-0 message-card`}>
          {m.role === 'assistant' ? (
            <div className="relative">
              <div className="absolute top-2 right-2 z-30">
                {editingId === m.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      className="icon-button"
                      aria-label="Save edit"
                      title="Save edit"
                      onClick={() => saveEdit(m.id)}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Cancel edit"
                      title="Cancel edit"
                      onClick={() => {
                        setEditingId(null);
                        setDraft('');
                      }}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {!isStreaming && (
                      <button
                        className="icon-button"
                        aria-label="Edit message"
                        title="Edit message"
                        onClick={() => {
                          setEditingId(m.id);
                          setDraft(m.content || '');
                        }}
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                    )}
                    <RegenerateMenu onChoose={(modelId) => regenerate(m.id, { modelId })} />
                  </div>
                )}
              </div>
              {/* Brave search UX block attached to this assistant message */}
              {(() => {
                const brave = braveByMessageId[m.id];
                if (!brave) return null;
                if (brave.status === 'loading') {
                  return (
                    <div className="px-4 pt-3">
                      <div className="thinking-panel">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="loading-dot" aria-hidden />
                          <span>Searching the web with Brave…</span>
                        </div>
                        <div className="thinking-shimmer" aria-hidden />
                      </div>
                    </div>
                  );
                }
                if (brave.status === 'done' && (brave.results || []).length > 0) {
                  return (
                    <div className="px-4 pt-3">
                      <div className="thinking-panel">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs text-muted-foreground">
                            Web search results (Brave)
                          </div>
                          <button
                            className="icon-button"
                            aria-label={isSourcesExpanded(m.id) ? 'Hide sources' : 'Show sources'}
                            onClick={() => toggleSources(m.id)}
                            aria-pressed={isSourcesExpanded(m.id)}
                          >
                            {isSourcesExpanded(m.id) ? (
                              <ChevronUpIcon className="h-4 w-4" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        {isSourcesExpanded(m.id) && (
                          <ol className="text-sm space-y-1 pl-5 list-decimal">
                            {(brave.results || []).map((r, i) => (
                              <li key={i}>
                                <a
                                  className="underline"
                                  href={r.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.title || r.url || `Result ${i + 1}`}
                                </a>
                                {r.description && (
                                  <div className="text-xs text-muted-foreground">
                                    {r.description}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  );
                }
                if (brave.status === 'done' && (!brave.results || brave.results.length === 0)) {
                  return (
                    <div className="px-4 pt-3">
                      <div className="thinking-panel">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="loading-dot" aria-hidden />
                          <span>No web results found</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                if (brave.status === 'error') {
                  return (
                    <div className="px-4 pt-3">
                      <div className="thinking-panel">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="loading-dot" aria-hidden />
                          <span>{brave.error || 'Web search failed'}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              {/* Thinking block styled like sources, inline header with icon toggle */}
              {typeof m.reasoning === 'string' && m.reasoning.length > 0 && (
                <div className="px-4 pt-3">
                  <div className="thinking-panel">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs text-muted-foreground">Thinking</div>
                      <button
                        className="icon-button"
                        aria-label={isExpanded(m.id) ? 'Hide thinking' : 'Show thinking'}
                        onClick={() => toggle(m.id)}
                        aria-pressed={isExpanded(m.id)}
                      >
                        {isExpanded(m.id) ? (
                          <ChevronUpIcon className="h-4 w-4" />
                        ) : (
                          <ChevronDownIcon className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {isExpanded(m.id) && (
                      <>
                        <pre className="whitespace-pre-wrap text-sm opacity-90 leading-relaxed">
                          {m.reasoning}
                        </pre>
                        <div className="thinking-shimmer" aria-hidden />
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="p-4 pt-3">
                {editingId === m.id ? (
                  <textarea
                    className="textarea w-full text-sm"
                    rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 60)))}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit(m.id);
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit(m.id);
                      }
                    }}
                    placeholder="Edit assistant message..."
                  />
                ) : (
                  <Markdown content={m.content} />
                )}
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
            <div className="relative">
              {/* Edit control for user messages */}
              <div className="absolute top-2 right-2 z-30">
                {editingId === m.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      className="icon-button"
                      aria-label="Save edit"
                      title="Save edit"
                      onClick={() => saveEdit(m.id)}
                    >
                      <CheckIcon className="h-4 w-4" />
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Cancel edit"
                      title="Cancel edit"
                      onClick={() => {
                        setEditingId(null);
                        setDraft('');
                      }}
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="icon-button"
                    aria-label="Edit message"
                    title="Edit message"
                    onClick={() => {
                      setEditingId(m.id);
                      setDraft(m.content || '');
                    }}
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="p-4 pt-3">
                {editingId === m.id ? (
                  <textarea
                    className="textarea w-full text-sm"
                    rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 60)))}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit(m.id);
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        saveEdit(m.id);
                      }
                    }}
                    placeholder="Edit your message..."
                  />
                ) : (
                  <Markdown content={m.content} />
                )}
              </div>
            </div>
          )}
        </div>
      ))}
      {showJump && (
        <div
          style={{
            position: 'sticky',
            bottom: 12,
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 50,
          }}
        >
          <button
            className="btn btn-outline btn-sm"
            aria-label="Jump to latest"
            onClick={() => {
              scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
              setShowJump(false);
              setAtBottom(true);
            }}
          >
            <ChevronDownIcon className="h-4 w-4" />
            <span style={{ marginLeft: 6 }}>Jump to latest</span>
          </button>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

// RegenerateMenu extracted to its own component
