'use client';
import { useMemo, memo, useCallback } from 'react';
import {
  PencilSquareIcon,
  CheckIcon,
  ClipboardIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import { Markdown } from '@/lib/markdown';
import { RegenerateMenu } from '@/components/RegenerateMenu';
import { MessagePanels } from '@/components/message/MessagePanels';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import { LearnerModelUpdates } from '@/components/message/LearnerModelUpdates';
import styles from './MessageCard.module.css';
import type { Chat, Message, ORModel, PersistedAttachment } from '@/lib/types';
import { MessageActions, ActionButton } from '@/components/message/MessageActions';
import { StatsToggle } from '@/components/message/StatsToggle';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { useMessageCardController } from '@/components/message/useMessageCardController';

export type MessagePanelControls = {
  isSourcesExpanded: (messageId: string) => boolean;
  toggleSources: (messageId: string) => void;
  isDebugExpanded: (messageId: string) => boolean;
  toggleDebug: (messageId: string) => void;
  isReasoningExpanded: (messageId: string) => boolean;
  toggleReasoning: (messageId: string) => void;
  isStatsExpanded: (messageId: string) => boolean;
  toggleStats: (messageId: string) => void;
};

export type MessageCardProps = {
  chatId: string;
  messageId: string;
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (id: string | null) => void;
  saveEdit: (messageId: string) => void;
  startEditingMessage: (messageId: string) => void;
  copyMessage: (messageId: string) => Promise<void> | void;
  copiedId: string | null;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  waitingForFirstToken: boolean;
  lastMessageId?: string;
  panels: MessagePanelControls;
  onOpenMobileSheet: (value: { id: string; role: 'assistant' | 'user' }) => void;
};

function MessageCardComponent({
  chatId,
  messageId,
  isMobile,
  isActive,
  showInlineActions,
  isEditing,
  draft,
  setDraft,
  setEditingId,
  saveEdit,
  startEditingMessage,
  copyMessage,
  copiedId,
  setLightbox,
  waitingForFirstToken,
  lastMessageId,
  panels,
  onOpenMobileSheet,
}: MessageCardProps) {
  const {
    message,
    chat,
    models,
    isStreaming,
    braveGloballyEnabled,
    braveEntry,
    debugMode,
    debugEntry,
    tutorGloballyEnabled,
    tutorEntry,
    autoReasoningModelIds,
    showToolCallLog,
    showDebugRawJson,
    showStats,
    tutorEnabled,
    actions,
  } = useMessageCardController({ chatId, messageId });

  if (!message) return null;

  const isAssistant = message.role === 'assistant';
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;

  const messageClassName = [
    'card',
    'p-0',
    'group',
    styles.messageCard,
    isAssistant ? styles.assistant : styles.user,
    isMobile && isActive ? styles.active : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleCopy = () => copyMessage(message.id);
  const handleStartEdit = () => startEditingMessage(message.id);
  const handleSaveEdit = () => saveEdit(message.id);
  const handleBranch = actions.branchFromMessage;
  const handleRegenerate = actions.regenerateMessage;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  const { onPointerDown, onContextMenu } = useLongPressSheet({
    isEnabled: isMobile,
    onTrigger: () => {
      onOpenMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
    },
  });

  const isSourcesExpanded = panels.isSourcesExpanded(message.id);
  const isDebugExpanded = panels.isDebugExpanded(message.id);
  const isReasoningExpanded = panels.isReasoningExpanded(message.id);
  const statsExpanded = panels.isStatsExpanded(message.id);

  const handleToggleSources = useCallback(
    () => panels.toggleSources(message.id),
    [message.id, panels],
  );
  const handleToggleDebug = useCallback(
    () => panels.toggleDebug(message.id),
    [message.id, panels],
  );
  const handleToggleReasoning = useCallback(
    () => panels.toggleReasoning(message.id),
    [message.id, panels],
  );
  const handleToggleStats = useCallback(() => panels.toggleStats(message.id), [message.id, panels]);

  const messagePanelsNode = isAssistant ? (
    <MessagePanels
      message={message}
      chat={chat}
      models={models}
      braveGloballyEnabled={braveGloballyEnabled}
      braveEntry={braveEntry}
      isSourcesExpanded={isSourcesExpanded}
      onToggleSources={handleToggleSources}
      debugMode={debugMode}
      debugEntry={debugEntry}
      isDebugExpanded={isDebugExpanded}
      onToggleDebug={handleToggleDebug}
      tutorGloballyEnabled={tutorGloballyEnabled}
      tutorEntry={tutorEntry}
      autoReasoningModelIds={autoReasoningModelIds}
      isStreaming={isStreaming}
      lastMessageId={lastMessageId}
      reasoningExpanded={isReasoningExpanded}
      onToggleReasoning={handleToggleReasoning}
      showToolCallLog={showToolCallLog}
      showDebugRawJson={showDebugRawJson}
      toolCalls={Array.isArray(message.toolCalls) ? message.toolCalls : undefined}
      highlightToolCalls={message.id === lastMessageId}
    />
  ) : null;

  return (
    <div
      className={messageClassName}
      data-mid={message.id}
      aria-label={message.role === 'assistant' ? 'Assistant message' : 'Your message'}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
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
          statsExpanded={statsExpanded}
          onToggleStats={handleToggleStats}
          branchFromMessage={handleBranch}
          onChooseRegenerateModel={handleRegenerate}
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

export const MessageCard = memo(MessageCardComponent);

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
  statsExpanded,
  onToggleStats,
  branchFromMessage,
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
  statsExpanded: boolean;
  onToggleStats: () => void;
  branchFromMessage: () => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  attachments: PersistedAttachment[];
  tutorEnabled: boolean;
  messagePanelsNode: React.ReactNode;
}) {
  const displayContent = useMemo(() => {
    if (message.content) return message.content;
    if (message.deepResearch?.answer) return message.deepResearch.answer;
    return '';
  }, [message.content, message.deepResearch?.answer]);

  return (
    <div className="relative">
      {showInlineActions && (
        <MessageActions
          isEditing={isEditing}
          isMobile={isMobile}
          onSave={saveEdit}
          onCancel={() => {
            setEditingId(null);
            setDraft('');
          }}
        >
          <ActionButton
            icon={
              copiedId === message.id ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <ClipboardIcon className="h-4 w-4" />
              )
            }
            title={copiedId === message.id ? 'Copied!' : 'Copy message'}
            ariaLabel="Copy message"
            onClick={copyMessage}
            showFeedback={copiedId === message.id}
          />
          {!isStreaming && (
            <ActionButton
              icon={<PencilSquareIcon className="h-4 w-4" />}
              title="Edit message"
              ariaLabel="Edit message"
              onClick={startEditingMessage}
            />
          )}
          <ActionButton
            icon={<ArrowUturnRightIcon className="h-4 w-4" />}
            title="Create a new chat starting from this reply"
            ariaLabel="Branch chat from here"
            onClick={branchFromMessage}
            disabled={isStreaming}
          />
          {!tutorEnabled && <RegenerateMenu onChoose={onChooseRegenerateModel} />}
        </MessageActions>
      )}

      {messagePanelsNode}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            className="message-edit-textarea"
            rows={Math.min(12, Math.max(4, Math.ceil((draft.length || 1) / 50)))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                saveEdit();
              }
            }}
            placeholder="Edit message..."
            autoFocus
          />
        ) : waitingForFirstToken && message.id === lastMessageId && !displayContent ? (
          <div className={styles.typingIndicator} aria-live="polite" aria-label="Generating">
            <span className={styles.typingBar} />
            <span className={styles.typingBar} />
            <span className={styles.typingBar} />
          </div>
        ) : (
          <Markdown content={displayContent} />
        )}
      </div>

      {/* Learner Model Updates */}
      {!isEditing && <LearnerModelUpdates message={message} />}

      <StatsToggle
        showStats={showStats}
        waitingForFirstToken={waitingForFirstToken}
        isLatestAssistant={isLatestAssistant}
        isExpanded={statsExpanded}
        onToggle={onToggleStats}
        message={message}
        chat={chat}
        models={models}
      />
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
  attachments: PersistedAttachment[];
}) {
  return (
    <div className="relative">
      {showInlineActions && (
        <MessageActions
          isEditing={isEditing}
          isMobile={isMobile}
          onSave={saveEdit}
          onCancel={() => {
            setEditingId(null);
            setDraft('');
          }}
        >
          <ActionButton
            icon={<PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />}
            title="Edit message"
            ariaLabel="Edit message"
            onClick={startEditingMessage}
          />
          <ActionButton
            className={`ml-1 ${copiedId === message.id ? 'feedback-correct' : ''}`}
            icon={
              copiedId === message.id ? (
                <div className="flex items-center gap-1.5 transition-all" style={{ color: 'var(--color-success)' }}>
                  <CheckIcon className="h-4 w-4" />
                  <span className="text-xs font-medium">Copied</span>
                </div>
              ) : (
                <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              )
            }
            title={copiedId === message.id ? 'Copied' : 'Copy message'}
            ariaLabel="Copy message"
            onClick={copyMessage}
          />
        </MessageActions>
      )}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      <div className="px-4 py-3">
        {isEditing ? (
          <textarea
            className="message-edit-textarea message-edit-textarea--user"
            rows={Math.min(8, Math.max(3, Math.ceil((draft.length || 1) / 50)))}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault();
                saveEdit();
              }
            }}
            placeholder="Edit your message..."
            autoFocus
          />
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
    </div>
  );
}
