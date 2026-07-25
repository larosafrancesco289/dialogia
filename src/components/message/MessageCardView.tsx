'use client';
import type { PointerEventHandler } from 'react';
import { MessagePanelsUpper } from '@/components/message/MessagePanels';
import { MessageModuleSlot } from '@/components/ModuleSlot';
import { AssistantMessage } from '@/components/message/AssistantMessage';
import { UserMessage } from '@/components/message/UserMessage';
import type { MessageCardViewModel } from '@/components/message/useMessageCardViewModel';
import type { MessagePanelState } from '@/components/message/hooks/useMessagePanels';
import { cn } from '@/lib/ui/cn';
import styles from './MessageCard.module.css';

export type MessageCardViewData = MessageCardViewModel & {
  chatId: string;
  messageId: string;
  isMobile: boolean;
  isActive: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  setEditingId: (id: string | null) => void;
  onSaveEdit: () => void;
  onStartEdit: () => void;
  onEditPrevious: () => void;
  onCopy: () => void;
  copiedId: string | null;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  waitingForFirstToken: boolean;
  lastMessageId?: string;
  panels: MessagePanelState;
  isStreaming: boolean;
  isChatStreaming: boolean;
  onBranch: () => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerMove?: PointerEventHandler<HTMLDivElement>;
  onPointerUp?: PointerEventHandler<HTMLDivElement>;
  onPointerCancel?: PointerEventHandler<HTMLDivElement>;
};

export function MessageCardView({ viewModel }: { viewModel: MessageCardViewData }) {
  const {
    message,
    chat,
    models,
    tavilyEntry,
    debugMode,
    debugEntry,
    autoReasoningModelIds,
    showToolCallLog,
    showDebugRawJson,
    showStats,
    tutorEnabled,
    isMobile,
    isActive,
    showInlineActions,
    isEditing,
    draft,
    setDraft,
    setEditingId,
    onSaveEdit,
    onStartEdit,
    onEditPrevious,
    onCopy,
    copiedId,
    setLightbox,
    waitingForFirstToken,
    lastMessageId,
    panels,
    isStreaming,
    isChatStreaming,
    onBranch,
    onChooseRegenerateModel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  } = viewModel;

  if (!message) return null;

  const isAssistant = message.role === 'assistant';
  const isLatestAssistant = message.role === 'assistant' && message.id === lastMessageId;

  const messageClassName = cn(
    'card',
    'p-0',
    'group',
    styles.messageCard,
    isAssistant ? styles.assistant : styles.user,
    isMobile && isActive && styles.active,
  );

  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const toolCalls = Array.isArray(message.toolCalls) ? message.toolCalls : undefined;

  const upperPanelsNode = isAssistant ? (
    <MessagePanelsUpper
      message={message}
      chat={chat}
      models={models}
      tavilyEntry={tavilyEntry}
      isSourcesExpanded={panels.sources.expanded}
      onToggleSources={panels.sources.onToggle}
      debugMode={debugMode}
      debugEntry={debugEntry}
      isDebugExpanded={panels.debug.expanded}
      onToggleDebug={panels.debug.onToggle}
      autoReasoningModelIds={autoReasoningModelIds}
      isStreaming={isStreaming}
      lastMessageId={lastMessageId}
      reasoningExpanded={panels.reasoning.expanded}
      onToggleReasoning={panels.reasoning.onToggle}
      showToolCallLog={showToolCallLog}
      showDebugRawJson={showDebugRawJson}
      toolCalls={toolCalls}
      highlightToolCalls={message.id === lastMessageId}
    />
  ) : null;

  const tutorPanelNode = isAssistant ? (
    <MessageModuleSlot slot="messagePanel" message={message} />
  ) : null;

  return (
    <div
      className={messageClassName}
      data-mid={message.id}
      aria-label={message.role === 'assistant' ? 'Assistant message' : 'Your message'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {isAssistant ? (
        <AssistantMessage
          message={message}
          isMobile={isMobile}
          showInlineActions={showInlineActions}
          isStreaming={isStreaming}
          isChatStreaming={isChatStreaming}
          isEditing={isEditing}
          copyMessage={onCopy}
          copiedId={copiedId}
          startEditingMessage={onStartEdit}
          onEditPreviousUserMessage={onEditPrevious}
          saveEdit={onSaveEdit}
          setEditingId={setEditingId}
          setDraft={setDraft}
          draft={draft}
          waitingForFirstToken={waitingForFirstToken}
          isLatestAssistant={isLatestAssistant}
          lastMessageId={lastMessageId}
          models={models}
          chat={chat}
          showStats={showStats}
          statsExpanded={panels.stats.expanded}
          onToggleStats={panels.stats.onToggle}
          branchFromMessage={onBranch}
          onChooseRegenerateModel={onChooseRegenerateModel}
          setLightbox={setLightbox}
          attachments={attachments}
          tutorEnabled={tutorEnabled}
          upperPanelsNode={upperPanelsNode}
          tutorPanelNode={tutorPanelNode}
          citationSources={tavilyEntry?.results}
        />
      ) : (
        <UserMessage
          message={message}
          isMobile={isMobile}
          showInlineActions={showInlineActions}
          isEditing={isEditing}
          copyMessage={onCopy}
          copiedId={copiedId}
          startEditingMessage={onStartEdit}
          saveEdit={onSaveEdit}
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
