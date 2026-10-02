import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { ReplyVersionSwitch } from '@/components/message/ReplyVersionSwitch';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import { MessageModuleSlot } from '@/components/ModuleSlot';
import { ActionButton, MessageEditBar } from '@/components/message/MessageActions';
import { MessageColophon } from '@/components/message/MessageColophon';
import { ReplySources } from '@/components/message/SourcesEntry';
import { StreamingMarkdown } from '@/components/message/StreamingMarkdown';
import { MemoryWrites } from '@/components/memory/MemoryWrites';
import { useChatStore } from '@/lib/store';
import { rendersAsBlocks } from '@/lib/markdown/blocks';
import { messageHasModuleContent } from '@/lib/modules';
import { versionCount } from '@/lib/messages/versions';
import type { Chat, Message, ModelDescriptor, PersistedAttachment } from '@/lib/types';
import { LogoMark } from '@/components/ui/LogoMark';
import { cn } from '@/lib/ui/cn';
import { penIsLive, toolCallInFlight } from '@/lib/ui/streaming';
import { replyEndingNote } from '@/lib/ui/replyEnding';
import { silentWaitLine } from '@/lib/ui/responseActivity';
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
  /** Whether this reply's versions can be switched and deleted: the latest exchange only. */
  canSwitchVersion: boolean;
  onDeleteVersion: (messageId: string) => void;
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

/**
 * A long wait for the first word, said quietly beside the mark and counted up
 * (from `since`, when the wait began before the mark). It stands out of the
 * flow, so neither its arrival nor its leaving (the moment anything arrives)
 * moves the reply. Hidden from screen readers, which would otherwise hear it
 * every second; the status already says a reply is coming.
 */
function SilentWait({ since, className = '' }: { since?: number; className?: string }) {
  const [startedAt] = useState(() => since ?? Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);
  const line = silentWaitLine(now - startedAt);
  if (!line) return null;
  return (
    <span className={`${styles.silentWait} ${className} motion-fade`} aria-hidden="true">
      {line}
    </span>
  );
}

/** How long the words may pause before the pen says the model is still at work. */
const QUIET_MS = 1000;

/** When the reply's words last changed, once they have rested QUIET_MS while `active`. */
function useQuietSince(content: string, active: boolean): number | undefined {
  // The rest belongs to the words it was measured on, so new words end it in
  // the same render rather than an effect later (which painted the pen under
  // the first word for a frame after a long wait).
  const [quiet, setQuiet] = useState<{ content: string; since: number }>();
  useEffect(() => {
    if (!active) return;
    const changedAt = Date.now();
    const timer = window.setTimeout(() => setQuiet({ content, since: changedAt }), QUIET_MS);
    return () => window.clearTimeout(timer);
  }, [content, active]);
  return active && quiet?.content === content ? quiet.since : undefined;
}

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
  canSwitchVersion,
  onDeleteVersion,
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
  // The reasoning line is up (thinking, or a tool call): its mark does the waiting.
  const ledgerUp = !!message.reasoning?.trim() || !!message.toolCalls?.length;
  const endingNote = replyEndingNote(message, hasModuleContent);
  // An empty version still has a footer: the way back to the others is in it.
  const hasVersions = versionCount(message) > 1;
  // Tried again with another model, say: the colophon names it even without its stats.
  const writtenByOtherModel =
    !canned && !!message.model && message.model !== chat?.settings.modelId;
  const writing = isStreaming && isLatestAssistant;
  const quietSince = useQuietSince(displayContent, writing);
  // A reply written while it was open fades its footer in as the words end;
  // one opened from history has it from the start.
  const wroteHere = useRef(false);
  if (writing) wroteHere.current = true;
  const penLive = writing && penIsLive(message, quietSince !== undefined);

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
  } else if (waitingForFirstToken && message.id === lastMessageId && !displayContent && !ledgerUp) {
    // The mark, answering: set where the first word will land, in the reply's
    // own paragraph, so the text arrives exactly where it waited.
    messageBody = (
      <div className="markdown" role="status" aria-label="Writing a reply">
        <p className={styles.waiting}>
          <LogoMark className={`${styles.pen} ${styles.penWaiting}`} live />
          <SilentWait />
        </p>
      </div>
    );
  } else if (isStreaming && isLatestAssistant && !displayContent && !hasModuleContent) {
    // Thinking or at a tool, no words yet: the reply keeps the line its first
    // word will land on, so neither the reasoning's arrival nor the answer's
    // shifts anything. The reasoning line's mark is the one answering meanwhile
    // (a tool call always puts that line up), so this one stays empty: one
    // live mark at a time, and it never hops between the two.
    messageBody = (
      <div className="markdown" aria-hidden="true">
        <p>{'\u00a0'}</p>
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
        {/* The words are out but the turn goes on: a tool call is being
            written or run (a card, a search), or the model works on its next
            round. The mark answers where what comes next lands. */}
        {penLive && (
          <div className="markdown" role="status" aria-label="Still working">
            <p>
              <LogoMark className={styles.pen} live />
              {quietSince !== undefined && !toolCallInFlight(message) && (
                <SilentWait since={quietSince} className={styles.silentWaitAfterPen} />
              )}
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

      {/* Under the reply once it is written, never above an answer still to come. */}
      {!isEditing && !(isStreaming && isLatestAssistant) && <MemoryWrites message={message} />}

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

      {!isStreaming && !isEditing && endingNote && (
        <p className="px-4 pb-2 text-xs italic text-fg-muted">{endingNote}</p>
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
                    ? "The reply was cut short by the provider's safety filter."
                    : 'A safety classifier blocked this request before the model could answer.'}
                  {message.stopPolicy ? ` Reason given: ${message.stopPolicy}.` : ''}
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
                  Try again
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
              Try again
            </button>
          </div>
        )}

      {!isStreaming && tutorPanelNode}

      {!isEditing && !isStreaming && <MessageModuleSlot slot="messageFooter" message={message} />}

      {/* The reply's footer: its actions where the eye finishes reading, then
          the colophon. Always there under the latest reply; older replies
          show it on hover. */}
      {!isStreaming &&
        !isEditing &&
        (displayContent.trim() || hasVersions) &&
        (showInlineActions || showStats || writtenByOtherModel || !!resolvedCitationSources) && (
          <div
            className={cn(
              'message-foot px-4',
              isLatestAssistant ? wroteHere.current && 'motion-fade' : styles.footOnHover,
            )}
          >
            {showInlineActions && (
              <div className="message-actions__group">
                <ReplyVersionSwitch
                  message={message}
                  canSwitch={canSwitchVersion}
                  disabled={isChatStreaming}
                  onDelete={onDeleteVersion}
                />
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
                  <RegenerateMenu
                    onChoose={onChooseRegenerateModel}
                    disabled={isChatStreaming}
                    replyModelId={message.model}
                  />
                )}
                {!canned && (
                  <ActionButton
                    icon={<ArrowUturnRightIcon className="h-4 w-4" />}
                    title="Branch in a new chat"
                    ariaLabel="Branch in a new chat"
                    onClick={branchFromMessage}
                    disabled={isChatStreaming}
                  />
                )}
                {!isChatStreaming && !canned && (
                  <ActionButton
                    icon={<PencilSquareIcon className="h-4 w-4" />}
                    title="Edit"
                    ariaLabel="Edit reply"
                    onClick={startEditingMessage}
                  />
                )}
              </div>
            )}
            {chat && (showStats || writtenByOtherModel) && (
              <MessageColophon message={message} chat={chat} models={models} stats={showStats} />
            )}
            {resolvedCitationSources && <ReplySources sources={resolvedCitationSources} />}
          </div>
        )}

      {!isEditing && !isStreaming && <MessageModuleSlot slot="messageAfter" message={message} />}
    </div>
  );
}
