'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/lib/store';
import { Markdown } from '@/lib/markdown';
import {
  ChevronDownIcon,
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  ClipboardIcon,
  ArrowPathIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import RegenerateMenu from '@/components/RegenerateMenu';
import { MessageMeta } from '@/components/message/MessageMeta';
import { BraveSourcesPanel } from '@/components/message/BraveSourcesPanel';
import { ReasoningPanel } from '@/components/message/ReasoningPanel';
import { DebugPanel } from '@/components/message/DebugPanel';
import { TutorPanel } from '@/components/message/TutorPanel';
import { findModelById, isReasoningSupported } from '@/lib/models';
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
  const autoReasoningModelIds = useChatStore((s) => s.ui.autoReasoningModelIds || {});
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
  // Mobile contextual action sheet (bottom)
  const [mobileSheet, setMobileSheet] = useState<{ id: string; role: 'assistant' | 'user' } | null>(
    null,
  );
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const update = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 640);
    update();
    window.addEventListener('resize', update, { passive: true } as any);
    return () => window.removeEventListener('resize', update as any);
  }, []);

  // Composer is now rendered outside this scroll container in ChatPane.

  // Track whether user is near the bottom to enable smart autoscroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distanceFromBottom = Math.max(el.scrollHeight - el.scrollTop - el.clientHeight, 0);
      const threshold = 100; // px
      const nearBottom = distanceFromBottom <= threshold;
      setAtBottom((prev) => (prev === nearBottom ? prev : nearBottom));
      // Show the jump button whenever the user is away from the bottom
      const shouldShowJump = !nearBottom;
      setShowJump((prev) => (prev === shouldShowJump ? prev : shouldShowJump));
      // Clear active message highlight on mobile when scrolling
      if (isMobile) {
        setActiveMessageId((current) => (current ? null : current));
      }
    };
    // Initialize state in case content already overflows
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => {
      el.removeEventListener('scroll', onScroll as any);
    };
  }, [isMobile]);

  const scrollToBottom = (behavior: ScrollBehavior) => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance <= 1) return; // already at bottom; avoid redundant scrolls
    // Schedule after layout to avoid fighting with Resize/Mutation updates
    requestAnimationFrame(() => {
      try {
        const target = Math.max(el.scrollHeight - el.clientHeight, 0);
        el.scrollTo({ top: target, behavior });
      } catch {
        // Fallback for older browsers
        el.scrollTop = Math.max(el.scrollHeight - el.clientHeight, 0);
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
  const showByDefault = chat?.settings.show_thinking_by_default ?? false;
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

  const copyMessage = async (messageId: string) => {
    const msg = messages.find((x) => x.id === messageId);
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg.content || '');
      setCopiedId(messageId);
      setTimeout(() => setCopiedId((id) => (id === messageId ? null : id)), 1200);
    } catch {}
  };

  const startEditingMessage = (messageId: string) => {
    const msg = messages.find((x) => x.id === messageId);
    if (!msg) return;
    setEditingId(messageId);
    setDraft(msg.content || '');
  };

  const branchFromMessage = (messageId: string) => {
    if (isStreaming) return;
    branchFrom(messageId);
  };

  const regenerateMessage = (messageId: string) => {
    regenerate(messageId, {} as any);
  };

  const mobileActionMessage = useMemo(() => {
    if (!mobileSheet) return null;
    return messages.find((msg) => msg.id === mobileSheet.id) ?? null;
  }, [mobileSheet, messages]);

  const mobileActionPreview = useMemo(() => {
    if (!mobileActionMessage) return null;
    const text = (mobileActionMessage.content || '').trim();
    if (text) {
      const normalized = text.replace(/\s+/g, ' ');
      return normalized.length > 160 ? `${normalized.slice(0, 160)}…` : normalized;
    }
    if (
      Array.isArray(mobileActionMessage.attachments) &&
      mobileActionMessage.attachments.length > 0
    ) {
      const first = mobileActionMessage.attachments[0];
      return first?.name || first?.kind || 'Attachment';
    }
    return null;
  }, [mobileActionMessage]);

  const closeMobileSheet = useCallback(() => {
    setMobileSheet(null);
    setActiveMessageId(null);
  }, [setMobileSheet, setActiveMessageId]);

  useEffect(() => {
    if (!isMobile || !mobileSheet) return;
    if (typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeMobileSheet();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobile, mobileSheet, closeMobileSheet]);

  useEffect(() => {
    if (!mobileSheet) return;
    const exists = messages.some((msg) => msg.id === mobileSheet.id);
    if (!exists) closeMobileSheet();
  }, [mobileSheet, messages, closeMobileSheet]);

  useEffect(() => {
    if (!isMobile || !mobileSheet) return;
    if (activeMessageId === mobileSheet.id) return;
    setActiveMessageId(mobileSheet.id);
  }, [isMobile, mobileSheet, activeMessageId, setActiveMessageId]);
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
      className="scroll-area message-list space-y-2 h-full"
      style={{ background: 'var(--color-canvas)' }}
    >
      {messages.map((m) => {
        const isEditingThisMessage = editingId === m.id;
        const showInlineActions = !isMobile || isEditingThisMessage;
        return (
          <div
            key={m.id}
            className={`card p-0 message-card group ${
              m.role === 'assistant' ? 'message-assistant' : 'message-user'
            } ${isMobile && activeMessageId === m.id ? 'is-active' : ''}`}
            data-mid={m.id}
            aria-label={m.role === 'assistant' ? 'Assistant message' : 'Your message'}
            onPointerDown={(e) => {
              if (!isMobile) return;
              if ((e as any).pointerType === 'mouse') return;
              const target = e.target as HTMLElement | null;
              if (
                target &&
                target.closest('button, .icon-button, a, input, textarea, [role="button"], .badge')
              )
                return; // interactive elements use their own handlers
              // Long-press detection
              const startX = e.clientX;
              const startY = e.clientY;
              let moved = false;
              const slop = 12;
              let fired = false;
              const tid = window.setTimeout(() => {
                fired = true;
                setActiveMessageId(m.id);
                setMobileSheet({ id: m.id, role: m.role as any });
              }, 320);
              const onMove = (ev: PointerEvent) => {
                const dx = Math.abs(ev.clientX - startX);
                const dy = Math.abs(ev.clientY - startY);
                if (dx > slop || dy > slop) {
                  moved = true;
                  window.clearTimeout(tid);
                  cleanup();
                }
              };
              const onUp = () => {
                window.clearTimeout(tid);
                cleanup();
                // If it wasn't a long press, do nothing (avoid finnicky toggles)
              };
              const onCancel = () => {
                window.clearTimeout(tid);
                cleanup();
              };
              const cleanup = () => {
                window.removeEventListener('pointermove', onMove as any);
                window.removeEventListener('pointerup', onUp as any);
                window.removeEventListener('pointercancel', onCancel as any);
              };
              window.addEventListener('pointermove', onMove as any, { passive: true } as any);
              window.addEventListener('pointerup', onUp as any);
              window.addEventListener('pointercancel', onCancel as any);
            }}
            onContextMenu={(e) => {
              // Fallback: if a context menu is about to open on iOS, hijack it for our sheet
              if (!isMobile) return;
              e.preventDefault();
              setActiveMessageId(m.id);
              setMobileSheet({ id: m.id, role: m.role as any });
            }}
          >
            {m.role === 'assistant' ? (
              <div className="relative">
                {showInlineActions && (
                  <div
                    className="message-actions absolute bottom-2 right-2 z-30 transition-opacity"
                    style={isMobile ? { opacity: 1 } : undefined}
                  >
                    {isEditingThisMessage ? (
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
                          onClick={() => copyMessage(m.id)}
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
                            onClick={() => startEditingMessage(m.id)}
                          >
                            <PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                          </button>
                        )}
                        <button
                          className="icon-button"
                          title="Create a new chat starting from this reply"
                          aria-label="Branch chat from here"
                          disabled={isStreaming}
                          onClick={() => branchFromMessage(m.id)}
                        >
                          <ArrowUturnRightIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                        </button>
                        <RegenerateMenu onChoose={(modelId) => regenerate(m.id, { modelId })} />
                      </div>
                    )}
                  </div>
                )}
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
                {(() => {
                  const reasoningText =
                    typeof m.reasoning === 'string' ? (m.reasoning as string) : '';
                  const isLatestAssistant = m.role === 'assistant' && m.id === lastMessageId;
                  const messageModelId = (m.model || chat?.settings?.model) ?? undefined;
                  const modelMeta = messageModelId
                    ? findModelById(models, messageModelId)
                    : undefined;
                  const modelAllowsReasoning = !!modelMeta && isReasoningSupported(modelMeta);
                  const hasReasoning = reasoningText.trim().length > 0;
                  const messageEffort = m.genSettings?.reasoning_effort;
                  const messageTokens = m.genSettings?.reasoning_tokens;
                  const chatEffort = chat?.settings.reasoning_effort;
                  const chatTokens = chat?.settings.reasoning_tokens;
                  const effortRequested =
                    typeof messageEffort === 'string'
                      ? messageEffort !== 'none'
                      : typeof chatEffort === 'string'
                        ? chatEffort !== 'none'
                        : false;
                  const tokensRequested =
                    typeof messageTokens === 'number'
                      ? messageTokens > 0
                      : typeof chatTokens === 'number'
                        ? chatTokens > 0
                        : false;
                  const isAutoReasoningModel = !!(
                    messageModelId && autoReasoningModelIds[messageModelId]
                  );
                  const allowStreaming =
                    (effortRequested || tokensRequested || isAutoReasoningModel) &&
                    modelAllowsReasoning &&
                    isLatestAssistant &&
                    isStreaming;
                  if (!hasReasoning && !allowStreaming) return null;
                  return (
                    <ReasoningPanel
                      reasoning={reasoningText}
                      expanded={isExpanded(m.id)}
                      onToggle={() => toggle(m.id)}
                      isStreaming={allowStreaming}
                    />
                  );
                })()}
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
                {showInlineActions && (
                  <div
                    className="message-actions absolute bottom-2 right-2 z-30 transition-opacity"
                    style={isMobile ? { opacity: 1 } : undefined}
                  >
                    {isEditingThisMessage ? (
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
                        onClick={() => startEditingMessage(m.id)}
                      >
                        <PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                      </button>
                    )}
                    {!isEditingThisMessage && (
                      <button
                        className="icon-button ml-1"
                        aria-label="Copy message"
                        title={copiedId === m.id ? 'Copied' : 'Copy message'}
                        onClick={() => copyMessage(m.id)}
                      >
                        {copiedId === m.id ? (
                          <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                        ) : (
                          <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                        )}
                      </button>
                    )}
                  </div>
                )}
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
        );
      })}
      {showJump && (
        <div className="jump-to-latest">
          <button
            className="icon-button glass jump-to-latest__button"
            aria-label="Jump to latest"
            title="Jump to latest"
            onClick={() => {
              scrollToBottom(prefersReducedMotion ? 'auto' : 'smooth');
              setShowJump(false);
              setAtBottom(true);
            }}
          >
            <ChevronDownIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Typing indicator is now rendered inline within the latest assistant message */}
      <div ref={endRef} />
      {/* Mobile action sheet */}
      {isMobile &&
        mobileSheet &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="mobile-sheet-overlay mobile-message-sheet-overlay"
            role="dialog"
            aria-modal="true"
            onClick={(event) => {
              if (event.target === event.currentTarget) closeMobileSheet();
            }}
          >
            <div
              className="mobile-sheet card mobile-message-sheet"
              role="menu"
              aria-label="Message actions"
            >
              <div className="mobile-sheet-handle" aria-hidden="true" />
              <div className="mobile-message-sheet__header">
                <div className="mobile-message-sheet__title">
                  <span className="mobile-message-sheet__heading">Message actions</span>
                  {mobileActionPreview && (
                    <p className="mobile-message-sheet__preview">{mobileActionPreview}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close actions"
                  onClick={closeMobileSheet}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mobile-message-sheet__actions">
                <button
                  type="button"
                  className="mobile-message-action"
                  onClick={async () => {
                    await copyMessage(mobileSheet.id);
                    closeMobileSheet();
                  }}
                >
                  <span className="mobile-message-action__icon">
                    <ClipboardIcon className="h-5 w-5" />
                  </span>
                  <span className="mobile-message-action__meta">
                    <span className="mobile-message-action__label">Copy</span>
                    <span className="mobile-message-action__hint">Copy message text</span>
                  </span>
                </button>
                {mobileActionMessage && (
                  <button
                    type="button"
                    className="mobile-message-action"
                    disabled={editingId === mobileActionMessage.id}
                    onClick={() => {
                      if (editingId === mobileActionMessage.id) return;
                      startEditingMessage(mobileActionMessage.id);
                      closeMobileSheet();
                    }}
                  >
                    <span className="mobile-message-action__icon">
                      <PencilSquareIcon className="h-5 w-5" />
                    </span>
                    <span className="mobile-message-action__meta">
                      <span className="mobile-message-action__label">
                        {editingId === mobileActionMessage.id ? 'Editing...' : 'Edit'}
                      </span>
                      <span className="mobile-message-action__hint">Modify this message</span>
                    </span>
                  </button>
                )}
                {mobileSheet.role === 'assistant' && (
                  <>
                    <button
                      type="button"
                      className="mobile-message-action"
                      disabled={isStreaming}
                      onClick={() => {
                        if (isStreaming) return;
                        branchFromMessage(mobileSheet.id);
                        closeMobileSheet();
                      }}
                    >
                      <span className="mobile-message-action__icon">
                        <ArrowUturnRightIcon className="h-5 w-5" />
                      </span>
                      <span className="mobile-message-action__meta">
                        <span className="mobile-message-action__label">Branch</span>
                        <span className="mobile-message-action__hint">
                          Start a new chat from here
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mobile-message-action"
                      onClick={() => {
                        regenerateMessage(mobileSheet.id);
                        closeMobileSheet();
                      }}
                    >
                      <span className="mobile-message-action__icon">
                        <ArrowPathIcon className="h-5 w-5" />
                      </span>
                      <span className="mobile-message-action__meta">
                        <span className="mobile-message-action__label">Regenerate</span>
                        <span className="mobile-message-action__hint">Ask the assistant again</span>
                      </span>
                    </button>
                  </>
                )}
              </div>
              <button
                type="button"
                className="btn btn-ghost w-full h-11"
                onClick={closeMobileSheet}
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
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
