'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import { ChevronDownIcon, PencilSquareIcon, CheckIcon, XMarkIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { BranchIcon } from '@/components/icons/Icons';
import RegenerateMenu from '@/components/RegenerateMenu';
import { MessageMeta } from '@/components/message/MessageMeta';
import { BraveSourcesPanel } from '@/components/message/BraveSourcesPanel';
import { ReasoningPanel } from '@/components/message/ReasoningPanel';
import { DebugPanel } from '@/components/message/DebugPanel';
import { TutorPanel } from '@/components/message/TutorPanel';
import type { Attachment } from '@/lib/types';
import ImageLightbox from '@/components/ImageLightbox';
 
// cost and model meta computed within MessageMeta when expanded

export default function MessageList({ chatId }: { chatId: string }) {
  const messages = useChatStore((s) => s.messages[chatId] ?? []);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const models = useChatStore((s) => s.models);
  const isStreaming = useChatStore((s) => s.ui.isStreaming);
  const braveByMessageId = useChatStore((s) => s.ui.braveByMessageId || {});
  const braveGloballyEnabled = useChatStore((s) => !!s.ui.experimentalBrave);
  const tutorByMessageId = useChatStore((s) => s.ui.tutorByMessageId || {});
  const tutorGloballyEnabled = useChatStore((s) => !!s.ui.experimentalTutor);
  const regenerate = useChatStore((s) => s.regenerateAssistantMessage);
  const branchFrom = useChatStore((s) => s.branchChatFromMessage);
  const showStats = chat?.settings.show_stats ?? false;
  const debugMode = useChatStore((s) => s.ui.debugMode || false);
  const debugByMessageId = useChatStore((s) => s.ui.debugByMessageId || {});
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }, []);

  const [lightbox, setLightbox] = useState<{
    images: { src: string; name?: string }[];
    index: number;
  } | null>(null);
  // Tap-to-highlight state for mobile actions
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);

  // Track whether user is near the bottom to enable smart autoscroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 100; // px
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
      setAtBottom(nearBottom);
      // Show the jump button whenever the user is away from the bottom
      setShowJump(!nearBottom);
      // Clear active message highlight on mobile when scrolling
      if (isMobile && activeMessageId) setActiveMessageId(null);
    };
    // Initialize state in case content already overflows
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => {
      el.removeEventListener('scroll', onScroll as any);
    };
  }, [isMobile, activeMessageId]);

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
  const [expandedDebugIds, setExpandedDebugIds] = useState<Record<string, boolean>>({});
  const toggleDebug = (id: string) => setExpandedDebugIds((s) => ({ ...s, [id]: !s[id] }));
  const isDebugExpanded = (id: string) => expandedDebugIds[id] ?? false;
  const editUserMessage = useChatStore((s) => s.editUserMessage);
  const editAssistantMessage = useChatStore((s) => s.editAssistantMessage);
  const [expandedStatsIds, setExpandedStatsIds] = useState<Record<string, boolean>>({});
  const toggleStats = (id: string) => setExpandedStatsIds((s) => ({ ...s, [id]: !s[id] }));
  const isStatsExpanded = (id: string) => expandedStatsIds[id] ?? false;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  // Subtle indicator for long time-to-first-token
  const waitingForFirstToken = useMemo(() => {
    if (!isStreaming) return false;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant') return false;
    const hasText = (last.content || '').length > 0 || (last.reasoning || '').length > 0;
    return !hasText;
  }, [isStreaming, messages]);
  const lastMessageId = useMemo(() => messages[messages.length - 1]?.id, [messages]);
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
  // Clear active highlight when tapping outside the active message on mobile
  useEffect(() => {
    if (!isMobile) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!activeMessageId) return;
      const target = e.target as Element | null;
      if (!target) return;
      const withinActive = target.closest(`[data-mid="${activeMessageId}"]`);
      if (withinActive) return;
      setActiveMessageId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [isMobile, activeMessageId]);
  return (
    <div
      ref={containerRef}
      className="scroll-area p-4 space-y-2 h-full"
      style={{ background: 'var(--color-canvas)' }}
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`card p-0 message-card group ${
            m.role === 'assistant' ? 'message-assistant' : 'message-user'
          } ${isMobile && activeMessageId === m.id ? 'is-active' : ''}`}
          data-mid={m.id}
          onClick={(e) => {
            // On mobile, tapping the message highlights it to reveal actions.
            if (!isMobile) return;
            const target = e.target as HTMLElement | null;
            if (
              target &&
              target.closest('button, .icon-button, a, input, textarea, [role="button"], .badge')
            )
              return;
            setActiveMessageId((prev) => (prev === m.id ? null : m.id));
          }}
          aria-label={m.role === 'assistant' ? 'Assistant message' : 'Your message'}
        >
          {m.role === 'assistant' ? (
            <div className="relative">
              <div className="message-actions absolute bottom-2 right-2 z-30 transition-opacity">
                {editingId === m.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      className="icon-button"
                      aria-label="Save edit"
                      title="Save edit"
                      onClick={() => saveEdit(m.id)}
                    >
                      <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
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
                      <XMarkIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      className="icon-button"
                      aria-label="Copy message"
                      title={copiedId === m.id ? 'Copied' : 'Copy message'}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(m.content || '');
                          setCopiedId(m.id);
                          setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1200);
                        } catch {}
                      }}
                    >
                      {copiedId === m.id ? (
                        <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </button>
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
                        <PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      title="Create a new chat starting from this reply"
                      aria-label="Branch chat from here"
                      disabled={isStreaming}
                      onClick={() => branchFrom(m.id)}
                    >
                      <BranchIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                    </button>
                    <RegenerateMenu onChoose={(modelId) => regenerate(m.id, { modelId })} />
                  </div>
                )}
              </div>
              {/* Brave search UX block attached to this assistant message (gated by experimental toggle) */}
              {(() => {
                if (!braveGloballyEnabled) return null;
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
              {/* Debug payload panel (raw OpenRouter request) */}
              {debugMode && debugByMessageId[m.id]?.body && (
                <DebugPanel
                  body={debugByMessageId[m.id].body}
                  expanded={isDebugExpanded(m.id)}
                  onToggle={() => toggleDebug(m.id)}
                />
              )}
              {/* Thinking block styled like sources, inline header with icon toggle */}
              {typeof m.reasoning === 'string' && m.reasoning.length > 0 && (
                <ReasoningPanel
                  reasoning={m.reasoning}
                  expanded={isExpanded(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              )}
              {/* Tutor interactive panels (MCQ, fill-blank, open, flashcards) */}
              {(() => {
                if (!tutorGloballyEnabled) return null;
                const tut = tutorByMessageId[m.id] || (m as any)?.tutor;
                if (!tut) return null;
                return (
                  <TutorPanel
                    messageId={m.id}
                    title={tut.title}
                    mcq={tut.mcq}
                    fillBlank={tut.fillBlank}
                    openEnded={tut.openEnded}
                    flashcards={tut.flashcards}
                    grading={(tut as any).grading}
                  />
                );
              })()}
              {/* Attachments (assistant-visible images/audio; PDFs shown as chips) */}
              {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                <div className="px-4 pt-2 flex flex-wrap gap-2">
                  {m.attachments
                    .filter((a: Attachment) => a.kind === 'image')
                    .map((a: Attachment, idx: number, arr: Attachment[]) => (
                      <button
                        key={a.id}
                        className="p-0 m-0 border-none bg-transparent"
                        onClick={() =>
                          setLightbox({
                            images: arr
                              .filter((x) => x.kind === 'image' && x.dataURL)
                              .map((x) => ({ src: x.dataURL!, name: x.name })),
                            index: idx,
                          })
                        }
                        title="Click to enlarge"
                      >
                        <img
                          src={a.dataURL}
                          alt={a.name || 'image'}
                          className="h-28 w-28 sm:h-36 sm:w-36 object-cover rounded border border-border"
                        />
                      </button>
                    ))}
                  {m.attachments
                    .filter((a: Attachment) => a.kind === 'audio')
                    .map((a: Attachment) => (
                      <div
                        key={a.id}
                        className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2"
                      >
                        {a.dataURL ? (
                          <audio controls src={a.dataURL} className="h-10" />
                        ) : (
                          <span className="text-xs">Audio attached</span>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate" title={a.name || 'Audio'}>
                            {a.name || 'Audio'}
                          </div>
                        </div>
                      </div>
                    ))}
                  {m.attachments
                    .filter((a: Attachment) => a.kind === 'pdf')
                    .map((a: Attachment) => (
                      <span
                        key={a.id}
                        className="badge"
                        title={`${a.name || 'PDF'}${a.pageCount ? ` • ${a.pageCount} pages` : ''}`}
                      >
                        {a.name || 'PDF'}
                        {a.pageCount ? ` (${a.pageCount}p)` : ''}
                      </span>
                    ))}
                </div>
              )}
              <div className="px-4 py-3">
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
                ) : waitingForFirstToken && m.id === lastMessageId ? (
                  <div className="typing-indicator" aria-live="polite" aria-label="Generating">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                ) : (
                  <Markdown content={m.content} />
                )}
              </div>
              {/* Stats summary removed to respect per-message toggle */}
              {showStats && !(waitingForFirstToken && m.id === lastMessageId) && (
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
              {/* Branching control moved to hover actions (bottom-right) */}
            </div>
          ) : (
            <div className="relative">
              {/* Edit control for user messages */}
              <div className="message-actions absolute bottom-2 right-2 z-30 transition-opacity">
                {editingId === m.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      className="icon-button"
                      aria-label="Save edit"
                      title="Save edit"
                      onClick={() => saveEdit(m.id)}
                    >
                      <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
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
                      <XMarkIcon className="h-5 w-5 sm:h-4 sm:w-4" />
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
                    <PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                  </button>
                )}
                {editingId !== m.id && (
                  <button
                    className="icon-button ml-1"
                    aria-label="Copy message"
                    title={copiedId === m.id ? 'Copied' : 'Copy message'}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(m.content || '');
                        setCopiedId(m.id);
                        setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1200);
                      } catch {}
                    }}
                  >
                    {copiedId === m.id ? (
                      <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                    ) : (
                      <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                    )}
                  </button>
                )}
              </div>
              {/* Attachments (user: images/audio/PDFs) */}
              {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                <div className="px-4 pt-2 flex flex-wrap gap-2">
                  {m.attachments
                    .filter((a: Attachment) => a.kind === 'image')
                    .map((a: Attachment, idx: number, arr: Attachment[]) => (
                      <button
                        key={a.id}
                        className="p-0 m-0 border-none bg-transparent"
                        onClick={() =>
                          setLightbox({
                            images: arr
                              .filter((x) => x.kind === 'image' && x.dataURL)
                              .map((x) => ({ src: x.dataURL!, name: x.name })),
                            index: idx,
                          })
                        }
                        title="Click to enlarge"
                      >
                        <img
                          src={a.dataURL}
                          alt={a.name || 'image'}
                          className="h-28 w-28 sm:h-36 sm:w-36 object-cover rounded border border-border"
                        />
                      </button>
                    ))}
                  {m.attachments
                    .filter((a: Attachment) => a.kind === 'audio')
                    .map((a: Attachment) => (
                      <div
                        key={a.id}
                        className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2"
                      >
                        {a.dataURL ? (
                          <audio controls src={a.dataURL} className="h-10" />
                        ) : (
                          <span className="text-xs">Audio attached</span>
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate" title={a.name || 'Audio'}>
                            {a.name || 'Audio'}
                          </div>
                        </div>
                      </div>
                    ))}
                  {m.attachments
                    .filter((a: Attachment) => a.kind === 'pdf')
                    .map((a: Attachment) => (
                      <span
                        key={a.id}
                        className="badge"
                        title={`${a.name || 'PDF'}${a.pageCount ? ` • ${a.pageCount} pages` : ''}`}
                      >
                        {a.name || 'PDF'}
                        {a.pageCount ? ` (${a.pageCount}p)` : ''}
                      </span>
                    ))}
                </div>
              )}
              <div className="px-4 py-3">
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
            bottom: 24,
            display: 'flex',
            justifyContent: 'flex-end',
            zIndex: 60,
            pointerEvents: 'none',
          }}
        >
          <button
            className="icon-button glass"
            aria-label="Jump to latest"
            title="Jump to latest"
            onClick={() => {
              scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
              setShowJump(false);
              setAtBottom(true);
            }}
            style={{ pointerEvents: 'auto', width: 36, height: 36 }}
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        </div>
      )}
      
      {/* Typing indicator is now rendered inline within the latest assistant message */}
      <div ref={endRef} />
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

// RegenerateMenu extracted to its own component
