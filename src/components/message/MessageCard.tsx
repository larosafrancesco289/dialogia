'use client';
import { memo, useCallback } from 'react';
import { MessagePanels } from '@/components/message/MessagePanels';
import styles from './MessageCard.module.css';
import { useLongPressSheet } from '@/lib/hooks/useLongPressSheet';
import { useMessageCardController } from '@/components/message/useMessageCardController';
import { AssistantMessage } from '@/components/message/AssistantMessage';
import { UserMessage } from '@/components/message/UserMessage';

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

  // All hooks must be called before any conditional returns
  const { onPointerDown, onContextMenu } = useLongPressSheet({
    isEnabled: isMobile && !!message,
    onTrigger: () => {
      if (message) {
        onOpenMobileSheet({ id: message.id, role: message.role as 'assistant' | 'user' });
      }
    },
  });

  const handleToggleSources = useCallback(
    () => message && panels.toggleSources(message.id),
    [message, panels],
  );
  const handleToggleDebug = useCallback(
    () => message && panels.toggleDebug(message.id),
    [message, panels],
  );
  const handleToggleReasoning = useCallback(
    () => message && panels.toggleReasoning(message.id),
    [message, panels],
  );
  const handleToggleStats = useCallback(
    () => message && panels.toggleStats(message.id),
    [message, panels],
  );

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

  const isSourcesExpanded = panels.isSourcesExpanded(message.id);
  const isDebugExpanded = panels.isDebugExpanded(message.id);
  const isReasoningExpanded = panels.isReasoningExpanded(message.id);
  const statsExpanded = panels.isStatsExpanded(message.id);

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
        <AssistantMessage
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
        <UserMessage
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
