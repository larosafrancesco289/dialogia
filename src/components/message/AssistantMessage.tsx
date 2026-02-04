'use client';
import { useMemo, type ReactNode } from 'react';
import {
  PencilSquareIcon,
  CheckIcon,
  ClipboardIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import { Markdown } from '@/components/Markdown';
import { RegenerateMenu } from '@/components/RegenerateMenu';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import { LearnerModelUpdates } from '@/components/message/LearnerModelUpdates';
import { MessageActions, ActionButton } from '@/components/message/MessageActions';
import { StatsToggle } from '@/components/message/StatsToggle';
import { StreamingText } from '@/components/message/StreamingText';
import { useChatStore } from '@/lib/store';
import { selectStudyCondition } from '@/lib/store/selectors';
import type { Chat, Message, ModelDescriptor, PersistedAttachment } from '@/lib/types';
import styles from './MessageCard.module.css';

export type AssistantMessageProps = {
  message: Message;
  isMobile: boolean;
  showInlineActions: boolean;
  isStreaming: boolean;
  isChatStreaming: boolean;
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
  models: ModelDescriptor[];
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
  /** Debug, reasoning, and brave source panels - rendered above message content */
  upperPanelsNode: ReactNode;
  /** Tutor panel - rendered below message content so tutor's text appears first */
  tutorPanelNode: ReactNode;
};

export function AssistantMessage({
  message,
  isMobile,
  showInlineActions,
  isStreaming,
  isChatStreaming,
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
  upperPanelsNode,
  tutorPanelNode,
}: AssistantMessageProps) {
  const studyCondition = useChatStore(selectStudyCondition);

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
          {!isChatStreaming && (
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
            disabled={isChatStreaming}
          />
          {!tutorEnabled && <RegenerateMenu onChoose={onChooseRegenerateModel} />}
        </MessageActions>
      )}

      {upperPanelsNode}

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
        ) : isStreaming && isLatestAssistant ? (
          <StreamingText content={displayContent} />
        ) : (
          <Markdown content={displayContent} />
        )}
      </div>

      {tutorPanelNode}

      {/* Learner Model Updates */}
      {!isEditing && studyCondition !== 'A' && <LearnerModelUpdates message={message} />}

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
