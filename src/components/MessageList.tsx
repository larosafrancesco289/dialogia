'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import RegenerateMenu from '@/components/RegenerateMenu';
import { MessageMeta } from '@/components/message/MessageMeta';
import { BraveSourcesPanel } from '@/components/message/BraveSourcesPanel';
import { ReasoningPanel } from '@/components/message/ReasoningPanel';

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
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= 1) return; // already at bottom; avoid redundant scrolls
    // Schedule after layout to avoid fighting with Resize/Mutation updates
    requestAnimationFrame(() => {
      try {
        el.scrollTo({ top: el.scrollHeight, behavior });
      } catch {
        // Fallback for older browsers
        el.scrollTop = el.scrollHeight;
      }
    });
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
  const [expandedStatsIds, setExpandedStatsIds] = useState<Record<string, boolean>>({});
  const toggleStats = (id: string) => setExpandedStatsIds((s) => ({ ...s, [id]: !s[id] }));
  const isStatsExpanded = (id: string) => expandedStatsIds[id] ?? false;
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
        <div key={m.id} className={`card p-0 message-card group`}>
          {m.role === 'assistant' ? (
            <div className="relative">
              <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
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
                return (
                  <BraveSourcesPanel
                    data={brave as any}
                    expanded={isSourcesExpanded(m.id)}
                    onToggle={() => toggleSources(m.id)}
                  />
                );
              })()}
              {/* Thinking block styled like sources, inline header with icon toggle */}
              {typeof m.reasoning === 'string' && m.reasoning.length > 0 && (
                <ReasoningPanel
                  reasoning={m.reasoning}
                  expanded={isExpanded(m.id)}
                  onToggle={() => toggle(m.id)}
                />
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
              {showStats && (
                <div className="px-4 pb-3 -mt-2">
                  {isStatsExpanded(m.id) ? (
                    <div className="text-xs text-muted-foreground">
                      {(() => {
                        const modelId = m.model || chat?.settings.model || 'unknown';
                        return (
                          <MessageMeta
                            message={m}
                            modelId={modelId}
                            chatSettings={chat!.settings}
                            models={models}
                            showStats={true}
                          />
                        );
                      })()}
                      <div className="mt-1">
                        <button className="badge" onClick={() => toggleStats(m.id)}>
                          Hide stats
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button className="badge" onClick={() => toggleStats(m.id)}>
                      stats
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              {/* Edit control for user messages */}
              <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
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
