import type { ReactNode } from 'react';
import {
  PencilSquareIcon,
  CheckIcon,
  ClipboardIcon,
  ArrowUturnRightIcon,
  ArrowPathIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import { Markdown, type MarkdownCitationSource } from '@/components/Markdown';
import { RegenerateMenu } from '@/components/RegenerateMenu';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import { MessageModuleSlot } from '@/components/ModuleSlot';
import { ActionButton, MessageEditBar } from '@/components/message/MessageActions';
import { MessageColophon } from '@/components/message/MessageColophon';
import { StreamingMarkdown } from '@/components/message/StreamingMarkdown';
import { useChatStore } from '@/lib/store';
import { rendersAsBlocks } from '@/lib/markdown/blocks';
import { messageHasModuleContent } from '@/lib/modules';
import type { Chat, Message, ModelDescriptor, PersistedAttachment } from '@/lib/types';
import { LogoMark } from '@/components/ui/LogoMark';
import { toolCallInFlight } from '@/lib/ui/streaming';
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
  /** Opens the preceding user message for editing (recovery from refusals). */
  onEditPreviousUserMessage: () => void;
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
  branchFromMessage: () => void;
  onChooseRegenerateModel: (modelId?: string) => void;
  /** Whether this reply can be regenerated (or the message before it rerun). */
  canRedo: boolean;
  setLightbox: (
    value: {
      images: { src: string; name?: string }[];
      index: number;
    } | null,
  ) => void;
  attachments: PersistedAttachment[];
  tutorEnabled: boolean;
  /** Debug, reasoning, and source context for this message */
  upperPanelsNode: ReactNode;
  /** Tutor panel - rendered below message content so tutor's text appears first */
  tutorPanelNode: ReactNode;
  /** The reply's sources, numbered as its [n] markers cite them (`resolveMessageSources`). */
  citationSources?: MarkdownCitationSource[];
};

// A reply that ended early says so, instead of reading as finished mid-sentence.
const CUT_OFF_NOTES: Record<NonNullable<Message['cutOff']>, string> = {
  stopped: 'Stopped before the end.',
  failed: 'Cut off by an error before the end.',
  interrupted: 'Cut off: the page closed while this was being written.',
};

export function AssistantMessage({
  message,
  isMobile: _isMobile,
  showInlineActions,
  isStreaming,
  isChatStreaming,
  isEditing,
  copyMessage,
  copiedId,
  startEditingMessage,
  onEditPreviousUserMessage,
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
  branchFromMessage,
  onChooseRegenerateModel,
  canRedo,
  setLightbox,
  attachments,
  tutorEnabled: _tutorEnabled,
  upperPanelsNode,
  tutorPanelNode,
  citationSources,
}: AssistantMessageProps) {
  const displayContent = message.content;
  // A reply whose content is a module's (a card) is not empty, words or not.
  const hasModuleContent = useChatStore((s) => messageHasModuleContent(s, message));
  // A canned greeting was never generated: nothing to redo, branch from or edit.
  const canned = !!message.tutorWelcome;
  const resolvedCitationSources = citationSources?.length ? citationSources : undefined;

  let messageBody: ReactNode = null;
  if (isEditing) {
    messageBody = (
      <textarea
        className="message-edit-textarea"
        rows={Math.min(12, Math.max(4, Math.ceil((draft.length || 1) / 50)))}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            saveEdit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setEditingId(null);
            setDraft('');
          }
        }}
        placeholder="Edit the reply…"
        autoFocus
      />
    );
  } else if (waitingForFirstToken && message.id === lastMessageId && !displayContent) {
    // The mark, answering: set where the first word will land, in the reply's
    // own paragraph, so the text arrives exactly where it waited.
    messageBody = (
      <div className="markdown" role="status" aria-label="Writing a reply">
        <p>
          <LogoMark className={styles.pen} live />
        </p>
      </div>
    );
  } else if ((isStreaming && isLatestAssistant) || rendersAsBlocks(displayContent)) {
    // One renderer from the first flush to the finished reply (and for replies
    // opened from history), so finishing never rebuilds what is on screen.
    messageBody = (
      <>
        <StreamingMarkdown
          content={displayContent}
          sources={resolvedCitationSources}
          streaming={isStreaming && isLatestAssistant}
        />
        {/* The words are out but a tool call is still being written or run
            (a card, a search): the mark keeps answering where its result lands. */}
        {isStreaming && isLatestAssistant && toolCallInFlight(message) && (
          <div className="markdown" role="status" aria-label="Still working">
            <p>
              <LogoMark className={styles.pen} live />
            </p>
          </div>
        )}
      </>
    );
  } else {
    messageBody = <Markdown content={displayContent} sources={resolvedCitationSources} />;
  }

  return (
    <div
      className={`message-content-anchor message-content-anchor--assistant${
        isEditing ? ' message-content-anchor--editing' : ''
      }`}
    >
      {upperPanelsNode}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      {messageBody && <div className="px-4 py-3">{messageBody}</div>}

      {isEditing && (
        <div className="px-4 pb-3">
          <MessageEditBar
            onSave={saveEdit}
            onCancel={() => {
              setEditingId(null);
              setDraft('');
            }}
          />
        </div>
      )}

      {!isStreaming && !isEditing && message.cutOff && displayContent.trim() && (
        <p className="px-4 pb-2 text-xs italic text-fg-muted">{CUT_OFF_NOTES[message.cutOff]}</p>
      )}

      {!isStreaming && !isEditing && message.finishReason === 'content_filter' && (
        <div className="px-4 pb-3 pt-1">
          <div className="message-notice">
            <div className="flex items-start gap-2.5">
              <ShieldExclamationIcon
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: 'var(--color-danger)' }}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-danger)' }}>
                  Declined by the model&rsquo;s safety filter
                </p>
                <p className="text-xs text-fg-muted">
                  {displayContent.trim()
                    ? 'The reply was cut short by a safety classifier.'
                    : 'A safety classifier blocked this request before the model could answer.'}
                  {message.stopPolicy ? ` Flagged policy: ${message.stopPolicy}.` : ''} Rewording
                  your message and sending it again usually resolves this.
                </p>
              </div>
            </div>
            {!isChatStreaming && canRedo && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                <button className="btn btn-sm" onClick={onEditPreviousUserMessage}>
                  <PencilSquareIcon className="h-3.5 w-3.5" />
                  Edit message
                </button>
                <button className="btn-ghost btn-sm" onClick={() => onChooseRegenerateModel()}>
                  <ArrowPathIcon className="h-3.5 w-3.5" />
                  Retry as-is
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!isStreaming &&
        !isChatStreaming &&
        isLatestAssistant &&
        !isEditing &&
        !displayContent.trim() &&
        !hasModuleContent &&
        message.finishReason !== 'content_filter' && (
          <div className="px-4 pb-2">
            <button className="btn-outline btn-sm" onClick={() => onChooseRegenerateModel()}>
              <ArrowPathIcon className="h-3.5 w-3.5" />
              No answer yet. Ask again
            </button>
          </div>
        )}

      {!isStreaming && tutorPanelNode}

      {!isEditing && !isStreaming && <MessageModuleSlot slot="messageFooter" message={message} />}

      {/* The reply's footer: its actions where the eye finishes reading, then
          the colophon. Always there under the latest reply; older replies
          show it on hover. */}
      {!isStreaming && !isEditing && displayContent.trim() && (showInlineActions || showStats) && (
        <div className={`message-foot px-4 ${isLatestAssistant ? '' : styles.footOnHover}`.trim()}>
          {showInlineActions && (
            <div className="message-actions__group">
              <ActionButton
                icon={
                  copiedId === message.id ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <ClipboardIcon className="h-4 w-4" />
                  )
                }
                title={copiedId === message.id ? 'Copied' : 'Copy'}
                ariaLabel="Copy message"
                onClick={copyMessage}
                showFeedback={copiedId === message.id}
              />
              {canRedo && !canned && (
                <RegenerateMenu onChoose={onChooseRegenerateModel} disabled={isChatStreaming} />
              )}
              {!canned && (
                <ActionButton
                  icon={<ArrowUturnRightIcon className="h-4 w-4" />}
                  title="Continue in a new chat from here"
                  ariaLabel="Branch chat from here"
                  onClick={branchFromMessage}
                  disabled={isChatStreaming}
                />
              )}
              {!isChatStreaming && !canned && (
                <ActionButton
                  icon={<PencilSquareIcon className="h-4 w-4" />}
                  title="Edit"
                  ariaLabel="Edit message"
                  onClick={startEditingMessage}
                />
              )}
            </div>
          )}
          {showStats && chat && <MessageColophon message={message} chat={chat} models={models} />}
        </div>
      )}

      {!isEditing && !isStreaming && <MessageModuleSlot slot="messageAfter" message={message} />}
    </div>
  );
}
