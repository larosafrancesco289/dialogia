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
import type { Attachment, Chat, Message, ORModel, ToolCallLogEntry } from '@/lib/types';
import { MessageActions, ActionButton } from '@/components/message/MessageActions';
import { StatsToggle } from '@/components/message/StatsToggle';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';

export type MessageCardProps = {
  message: Message;
  chat?: Chat | null;
  models: ORModel[];
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isStreaming: boolean;
  isEditing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (id: string | null) => void;
  saveEdit: (messageId: string) => void;
  startEditingMessage: (messageId: string) => void;
  copyMessage: (messageId: string) => Promise<void> | void;
  copiedId: string | null;
  branchFromMessage: (messageId: string) => void;
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
  tutorEnabled: boolean;
  setActiveMessageId: (id: string | null) => void;
  setMobileSheet: (sheet: { id: string; role: 'assistant' | 'user' } | null) => void;
  // Flattened MessagePanels props
  braveGloballyEnabled: boolean;
  braveEntry?: any;
  isSourcesExpanded: boolean;
  onToggleSources: (id: string) => void;
  debugMode: boolean;
  debugEntry?: { body: string; createdAt: number } | null;
  isDebugExpanded: boolean;
  onToggleDebug: (id: string) => void;
  tutorGloballyEnabled: boolean;
  tutorEntry?: any;
  autoReasoningModelIds: Record<string, boolean>;
  isReasoningExpanded: boolean;
  onToggleReasoning: (id: string) => void;
  showToolCallLog: boolean;
  showDebugRawJson: boolean;
  toolCalls?: ToolCallLogEntry[];
  highlightToolCalls?: boolean;
};

function MessageCardComponent({
  message,
  chat,
  models,
  isMobile,
  isActive,
  showInlineActions,
  isStreaming,
  isEditing,
  draft,
  setDraft,
  setEditingId,
  saveEdit,
  startEditingMessage,
  copyMessage,
  copiedId,
  branchFromMessage,
  onChooseRegenerateModel,
  setLightbox,
  waitingForFirstToken,
  lastMessageId,
  showStats,
  isStatsExpanded,
  toggleStats,
  tutorEnabled,
  setActiveMessageId,
  setMobileSheet,
  braveGloballyEnabled,
  braveEntry,
  isSourcesExpanded,
  onToggleSources,
  debugMode,
  debugEntry,
  isDebugExpanded,
  onToggleDebug,
  tutorGloballyEnabled,
  tutorEntry,
  autoReasoningModelIds,
  isReasoningExpanded,
  onToggleReasoning,
  showToolCallLog,
  showDebugRawJson,
  toolCalls,
  highlightToolCalls,
}: MessageCardProps) {
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
  const handleBranch = () => branchFromMessage(message.id);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  const { onPointerDown, onContextMenu } = useLongPressSheet({
    isEnabled: isMobile,
    onTrigger: () => {
      setActiveMessageId(message.id);
      setMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
    },
  });

  const handleToggleSources = useCallback(
    () => onToggleSources(message.id),
    [message.id, onToggleSources],
  );
  const handleToggleDebug = useCallback(
    () => onToggleDebug(message.id),
    [message.id, onToggleDebug],
  );
  const handleToggleReasoning = useCallback(
    () => onToggleReasoning(message.id),
    [message.id, onToggleReasoning],
  );

  const messagePanelsNode = useMemo(
    () => (
      <MessagePanels
        message={message}
        chat={chat ?? undefined}
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
        toolCalls={toolCalls}
        highlightToolCalls={highlightToolCalls}
      />
    ),
    [
      message,
      chat,
      models,
      braveGloballyEnabled,
      braveEntry,
      isSourcesExpanded,
      handleToggleSources,
      debugMode,
      debugEntry,
      isDebugExpanded,
      handleToggleDebug,
      tutorGloballyEnabled,
      tutorEntry,
      autoReasoningModelIds,
      isStreaming,
      lastMessageId,
      isReasoningExpanded,
      handleToggleReasoning,
      showToolCallLog,
      showDebugRawJson,
      toolCalls,
      highlightToolCalls,
    ],
  );

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
          isStatsExpanded={isStatsExpanded}
          toggleStats={toggleStats}
          branchFromMessage={handleBranch}
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
  isStatsExpanded,
  toggleStats,
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
  isStatsExpanded: (id: string) => boolean;
  toggleStats: (id: string) => void;
  branchFromMessage: () => void;
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
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 transition-all">
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
            className={copiedId === message.id ? 'bg-green-500/10 border-green-500/20' : ''}
          />
          {!isStreaming && (
            <ActionButton
              icon={<PencilSquareIcon className="h-5 w-5 sm:h-4 sm:w-4" />}
              title="Edit message"
              ariaLabel="Edit message"
              onClick={startEditingMessage}
            />
          )}
          <ActionButton
            icon={<ArrowUturnRightIcon className="h-5 w-5 sm:h-4 sm:w-4" />}
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
          <div className={styles.typingIndicator} aria-live="polite" aria-label="Generating">
            <span className={styles.typingBar} />
            <span className={styles.typingBar} />
            <span className={styles.typingBar} />
          </div>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>

      {/* Learner Model Updates */}
      {!isEditing && <LearnerModelUpdates message={message} />}

      <StatsToggle
        showStats={showStats}
        waitingForFirstToken={waitingForFirstToken}
        isLatestAssistant={isLatestAssistant}
        isExpanded={isStatsExpanded(message.id)}
        onToggle={() => toggleStats(message.id)}
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
  attachments: Attachment[];
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
            className="ml-1"
            icon={
              copiedId === message.id ? (
                <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 transition-all">
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
