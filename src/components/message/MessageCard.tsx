'use client';
import { useMemo } from 'react';
import {
  PencilSquareIcon,
  CheckIcon,
  XMarkIcon,
  ClipboardIcon,
  ArrowPathIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import { Markdown } from '@/lib/markdown';
import RegenerateMenu from '@/components/RegenerateMenu';
import { MessageMeta } from '@/components/message/MessageMeta';
import MessagePanels, { type MessagePanelsProps } from '@/components/message/MessagePanels';
import type { Attachment, Chat, Message, ORModel } from '@/lib/types';

export type MessageCardProps = {
  message: Message;
  chat?: Chat | null;
  models: ORModel[];
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isStreaming: boolean;
  isEditing: boolean;
  editingId: string | null;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (id: string | null) => void;
  saveEdit: (messageId: string) => void;
  startEditingMessage: (messageId: string) => void;
  copyMessage: (messageId: string) => Promise<void> | void;
  copiedId: string | null;
  branchFromMessage: (messageId: string) => void;
  regenerateMessage: (messageId: string) => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  waitingForFirstToken: boolean;
  lastMessageId?: string;
  showStats: boolean;
  isStatsExpanded: (messageId: string) => boolean;
  toggleStats: (messageId: string) => void;
  messagePanels: Omit<MessagePanelsProps, 'message'>;
  activeMessageId: string | null;
  setActiveMessageId: (id: string | null) => void;
  setMobileSheet: (sheet: { id: string; role: 'assistant' | 'user' } | null) => void;
  mobileSheet: { id: string; role: 'assistant' | 'user' } | null;
  closeMobileSheet: () => void;
  tutorEnabled: boolean;
};

export default function MessageCard({
  message,
  chat,
  models,
  isMobile,
  isActive,
  showInlineActions,
  isStreaming,
  isEditing,
  editingId,
  draft,
  setDraft,
  setEditingId,
  saveEdit,
  startEditingMessage,
  copyMessage,
  copiedId,
  branchFromMessage,
  regenerateMessage,
  onChooseRegenerateModel,
  setLightbox,
  waitingForFirstToken,
  lastMessageId,
  showStats,
  isStatsExpanded,
  toggleStats,
  messagePanels,
  activeMessageId,
  setActiveMessageId,
  setMobileSheet,
  mobileSheet,
  closeMobileSheet,
  tutorEnabled,
}: MessageCardProps) {
  const isAssistant = message.role === 'assistant';
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;

  const handleCopy = () => copyMessage(message.id);
  const handleStartEdit = () => startEditingMessage(message.id);
  const handleSaveEdit = () => saveEdit(message.id);
  const handleBranch = () => branchFromMessage(message.id);
  const handleRegenerate = () => regenerateMessage(message.id);

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  const handleTouchStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    if ((event as any).pointerType === 'mouse') return;
    const target = event.target as HTMLElement | null;
    if (
      target &&
      target.closest('button, .icon-button, a, input, textarea, [role="button"], .badge')
    )
      return;
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const slop = 12;
    let fired = false;
    const timer = window.setTimeout(() => {
      fired = true;
      setActiveMessageId(message.id);
      setMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
    }, 320);
    const onMove = (ev: PointerEvent) => {
      const dx = Math.abs(ev.clientX - startX);
      const dy = Math.abs(ev.clientY - startY);
      if (dx > slop || dy > slop) {
        moved = true;
        window.clearTimeout(timer);
        cleanup();
      }
    };
    const onUp = () => {
      window.clearTimeout(timer);
      cleanup();
    };
    const onCancel = () => {
      window.clearTimeout(timer);
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
  };

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    event.preventDefault();
    setActiveMessageId(message.id);
    setMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
  };

  const renderAttachments = (filter: (attachment: Attachment) => boolean) =>
    attachments.filter(filter);

  const messagePanelsNode = useMemo(
    () => (
      <MessagePanels
        message={message}
        chat={chat ?? undefined}
        models={models}
        braveGloballyEnabled={messagePanels.braveGloballyEnabled}
        braveEntry={messagePanels.braveEntry}
        isSourcesExpanded={messagePanels.isSourcesExpanded}
        onToggleSources={messagePanels.onToggleSources}
        debugMode={messagePanels.debugMode}
        debugEntry={messagePanels.debugEntry}
        isDebugExpanded={messagePanels.isDebugExpanded}
        onToggleDebug={messagePanels.onToggleDebug}
        tutorGloballyEnabled={messagePanels.tutorGloballyEnabled}
        tutorEnabled={messagePanels.tutorEnabled}
        tutorEntry={messagePanels.tutorEntry}
        tutorMemoryDebug={messagePanels.tutorMemoryDebug}
        tutorMemoryAutoUpdateDefault={messagePanels.tutorMemoryAutoUpdateDefault}
        updateChatSettings={messagePanels.updateChatSettings}
        autoReasoningModelIds={messagePanels.autoReasoningModelIds}
        isStreaming={messagePanels.isStreaming}
        lastMessageId={messagePanels.lastMessageId}
        reasoningExpanded={messagePanels.reasoningExpanded}
        onToggleReasoning={messagePanels.onToggleReasoning}
      />
    ),
    [message, chat, models, messagePanels],
  );

  return (
    <div
      className={`card p-0 message-card group ${
        message.role === 'assistant' ? 'message-assistant' : 'message-user'
      } ${isMobile && isActive ? 'is-active' : ''}`}
      data-mid={message.id}
      aria-label={message.role === 'assistant' ? 'Assistant message' : 'Your message'}
      onPointerDown={handleTouchStart}
      onContextMenu={handleContextMenu}
    >
      {isAssistant ? (
        <AssistantMessageContent
          message={message}
          isMobile={isMobile}
          showInlineActions={showInlineActions}
          isStreaming={isStreaming}
          isEditing={isEditing}
          copyMessage={handleCopy}
          copiedId={copiedId}
          startEditingMessage={handleStartEdit}
          saveEdit={handleSaveEdit}
          setEditingId={setEditingId}
          setDraft={setDraft}
          draft={draft}
          waitingForFirstToken={waitingForFirstToken}
          isLatestAssistant={isLatestAssistant}
          lastMessageId={lastMessageId}
          models={models}
          chat={chat}
          showStats={showStats}
          isStatsExpanded={isStatsExpanded}
          toggleStats={toggleStats}
          branchFromMessage={handleBranch}
          regenerateMessage={handleRegenerate}
          onChooseRegenerateModel={onChooseRegenerateModel}
          setLightbox={setLightbox}
          attachments={attachments}
          tutorEnabled={tutorEnabled}
          messagePanelsNode={messagePanelsNode}
        />
      ) : (
        <UserMessageContent
          message={message}
          isMobile={isMobile}
          showInlineActions={showInlineActions}
          isEditing={isEditing}
          copyMessage={handleCopy}
          copiedId={copiedId}
          startEditingMessage={handleStartEdit}
          saveEdit={handleSaveEdit}
          setEditingId={setEditingId}
          setDraft={setDraft}
          draft={draft}
          setLightbox={setLightbox}
          attachments={attachments}
        />
      )}
    </div>
  );
}

function AssistantMessageContent({
  message,
  isMobile,
  showInlineActions,
  isStreaming,
  isEditing,
  copyMessage,
  copiedId,
  startEditingMessage,
  saveEdit,
  setEditingId,
  setDraft,
  draft,
  waitingForFirstToken,
  isLatestAssistant,
  lastMessageId,
  models,
  chat,
  showStats,
  isStatsExpanded,
  toggleStats,
  branchFromMessage,
  regenerateMessage,
  onChooseRegenerateModel,
  setLightbox,
  attachments,
  tutorEnabled,
  messagePanelsNode,
}: {
  message: Message;
  isMobile: boolean;
  showInlineActions: boolean;
  isStreaming: boolean;
  isEditing: boolean;
  copyMessage: () => void;
  copiedId: string | null;
  startEditingMessage: () => void;
  saveEdit: () => void;
  setEditingId: (id: string | null) => void;
  setDraft: (value: string) => void;
  draft: string;
  waitingForFirstToken: boolean;
  isLatestAssistant: boolean;
  lastMessageId?: string;
  models: ORModel[];
  chat?: Chat | null;
  showStats: boolean;
  isStatsExpanded: (id: string) => boolean;
  toggleStats: (id: string) => void;
  branchFromMessage: () => void;
  regenerateMessage: () => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  attachments: Attachment[];
  tutorEnabled: boolean;
  messagePanelsNode: React.ReactNode;
}) {
  return (
    <div className="relative">
      {showInlineActions && (
        <div
          className="message-actions absolute bottom-2 right-2 z-30 transition-opacity"
          style={isMobile ? { opacity: 1 } : undefined}
        >
          {isEditing ? (
            <div className="flex items-center gap-1">
              <button
                className="icon-button"
                aria-label="Save edit"
                title="Save edit"
                onClick={saveEdit}
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
                title={copiedId === message.id ? 'Copied' : 'Copy message'}
                onClick={copyMessage}
              >
                {copiedId === message.id ? (
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
                  onClick={startEditingMessage}
                >
                  <PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              )}
              <button
                className="icon-button"
                title="Create a new chat starting from this reply"
                aria-label="Branch chat from here"
                disabled={isStreaming}
                onClick={branchFromMessage}
              >
                <ArrowUturnRightIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              {!tutorEnabled && <RegenerateMenu onChoose={onChooseRegenerateModel} />}
            </div>
          )}
        </div>
      )}

      {messagePanelsNode}

      {attachments.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-2">
          {attachments
            .filter((attachment) => attachment.kind === 'image')
            .map((attachment, index, array) => (
              <button
                key={attachment.id}
                className="p-0 m-0 border-none bg-transparent"
                onClick={() =>
                  setLightbox({
                    images: array
                      .filter((item) => item.kind === 'image' && item.dataURL)
                      .map((item) => ({ src: item.dataURL!, name: item.name })),
                    index,
                  })
                }
                title="Click to enlarge"
              >
                <img
                  src={attachment.dataURL}
                  alt={attachment.name || 'image'}
                  className="h-28 w-28 sm:h-36 sm:w-36 object-cover rounded border border-border"
                />
              </button>
            ))}
          {attachments
            .filter((attachment) => attachment.kind === 'audio')
            .map((attachment) => (
              <div
                key={attachment.id}
                className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2"
              >
                {attachment.dataURL ? (
                  <audio controls src={attachment.dataURL} className="h-10" />
                ) : (
                  <span className="text-xs">Audio attached</span>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate" title={attachment.name || 'Audio'}>
                    {attachment.name || 'Audio'}
                  </div>
                </div>
              </div>
            ))}
          {attachments
            .filter((attachment) => attachment.kind === 'pdf')
            .map((attachment) => (
              <span
                key={attachment.id}
                className="badge"
                title={`${attachment.name || 'PDF'}${attachment.pageCount ? ` • ${attachment.pageCount} pages` : ''}`}
              >
                {attachment.name || 'PDF'}
                {attachment.pageCount ? ` (${attachment.pageCount}p)` : ''}
              </span>
            ))}
        </div>
      )}

      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            className="textarea w-full text-sm"
            rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 60)))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                saveEdit();
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                saveEdit();
              }
            }}
            placeholder="Edit assistant message..."
          />
        ) : waitingForFirstToken && message.id === lastMessageId ? (
          <div className="typing-indicator" aria-live="polite" aria-label="Generating">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>

      {showStats && !(waitingForFirstToken && message.id === lastMessageId) && (
        <div className="px-4 pb-3 -mt-2">
          {isStatsExpanded(message.id) ? (
            <div className="text-xs text-muted-foreground">
              <MessageMeta
                message={message}
                modelId={message.model || chat?.settings.model || 'unknown'}
                chatSettings={chat!.settings}
                models={models}
                showStats={true}
              />
              <div className="mt-1">
                <button className="badge" onClick={() => toggleStats(message.id)}>
                  Hide stats
                </button>
              </div>
            </div>
          ) : (
            <button className="badge" onClick={() => toggleStats(message.id)}>
              stats
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UserMessageContent({
  message,
  isMobile,
  showInlineActions,
  isEditing,
  copyMessage,
  copiedId,
  startEditingMessage,
  saveEdit,
  setEditingId,
  setDraft,
  draft,
  setLightbox,
  attachments,
}: {
  message: Message;
  isMobile: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  copyMessage: () => void;
  copiedId: string | null;
  startEditingMessage: () => void;
  saveEdit: () => void;
  setEditingId: (id: string | null) => void;
  setDraft: (value: string) => void;
  draft: string;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  attachments: Attachment[];
}) {
  return (
    <div className="relative">
      {showInlineActions && (
        <div
          className="message-actions absolute bottom-2 right-2 z-30 transition-opacity"
          style={isMobile ? { opacity: 1 } : undefined}
        >
          {isEditing ? (
            <div className="flex items-center gap-1">
              <button
                className="icon-button"
                aria-label="Save edit"
                title="Save edit"
                onClick={saveEdit}
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
              onClick={startEditingMessage}
            >
              <PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />
            </button>
          )}
          {!isEditing && (
            <button
              className="icon-button ml-1"
              aria-label="Copy message"
              title={copiedId === message.id ? 'Copied' : 'Copy message'}
              onClick={copyMessage}
            >
              {copiedId === message.id ? (
                <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              ) : (
                <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              )}
            </button>
          )}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="px-4 pt-2 flex flex-wrap gap-2">
          {attachments
            .filter((attachment) => attachment.kind === 'image')
            .map((attachment, index, array) => (
              <button
                key={attachment.id}
                className="p-0 m-0 border-none bg-transparent"
                onClick={() =>
                  setLightbox({
                    images: array
                      .filter((item) => item.kind === 'image' && item.dataURL)
                      .map((item) => ({ src: item.dataURL!, name: item.name })),
                    index,
                  })
                }
                title="Click to enlarge"
              >
                <img
                  src={attachment.dataURL}
                  alt={attachment.name || 'image'}
                  className="h-28 w-28 sm:h-36 sm:w-36 object-cover rounded border border-border"
                />
              </button>
            ))}
          {attachments
            .filter((attachment) => attachment.kind === 'audio')
            .map((attachment) => (
              <div
                key={attachment.id}
                className="h-16 min-w-40 sm:min-w-48 max-w-72 px-3 py-2 rounded border border-border bg-muted/50 flex items-center gap-2"
              >
                {attachment.dataURL ? (
                  <audio controls src={attachment.dataURL} className="h-10" />
                ) : (
                  <span className="text-xs">Audio attached</span>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate" title={attachment.name || 'Audio'}>
                    {attachment.name || 'Audio'}
                  </div>
                </div>
              </div>
            ))}
          {attachments
            .filter((attachment) => attachment.kind === 'pdf')
            .map((attachment) => (
              <span
                key={attachment.id}
                className="badge"
                title={`${attachment.name || 'PDF'}${attachment.pageCount ? ` • ${attachment.pageCount} pages` : ''}`}
              >
                {attachment.name || 'PDF'}
                {attachment.pageCount ? ` (${attachment.pageCount}p)` : ''}
              </span>
            ))}
        </div>
      )}

      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            className="textarea w-full text-sm"
            rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 60)))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                saveEdit();
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                saveEdit();
              }
            }}
            placeholder="Edit your message..."
          />
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  );
}
