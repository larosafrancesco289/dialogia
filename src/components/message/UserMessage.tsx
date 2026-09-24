import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { PencilSquareIcon, CheckIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { Markdown } from '@/components/Markdown';
import { MessageActions, ActionButton, MessageEditBar } from '@/components/message/MessageActions';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import type { Message, PersistedAttachment } from '@/lib/types';
import { USER_MESSAGE_MAX_LINES, exceedsClamp, mightNeedClamp } from '@/lib/ui/userMessageClamp';

const CLAMP_STYLE = { '--user-clamp-lines': USER_MESSAGE_MAX_LINES } as CSSProperties;

/**
 * A long message folds to its first lines, measured as rendered (widths and
 * wrapping differ), with a quiet toggle to read the rest. Never while editing.
 */
function useUserMessageClamp(content: string, isEditing: boolean) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const candidate = !isEditing && mightNeedClamp(content);

  // Before paint, so a long message never shows at full height first.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!candidate || !body) {
      setOverflows(false);
      return;
    }
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(body).lineHeight);
      setOverflows(exceedsClamp(body.scrollHeight, lineHeight));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [candidate, content]);

  return { bodyRef, clamped: overflows && !expanded, overflows, expanded, setExpanded };
}

export type UserMessageProps = {
  message: Message;
  isMobile: boolean;
  showInlineActions: boolean;
  isEditing: boolean;
  copyMessage: () => void;
  copiedId: string | null;
  startEditingMessage: () => void;
  /** Editing reruns the reply; some chats allow that only in the latest exchange. */
  canEdit: boolean;
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
};

export function UserMessage({
  message,
  isMobile,
  showInlineActions,
  isEditing,
  copyMessage,
  copiedId,
  startEditingMessage,
  canEdit,
  saveEdit,
  setEditingId,
  setDraft,
  draft,
  setLightbox,
  attachments,
}: UserMessageProps) {
  const clamp = useUserMessageClamp(message.content, isEditing);
  const bodyId = useId();
  return (
    <div>
      {showInlineActions && (
        <MessageActions isEditing={isEditing} isMobile={isMobile}>
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
          {canEdit && (
            <ActionButton
              icon={<PencilSquareIcon className="h-4 w-4" />}
              title="Edit"
              ariaLabel="Edit message"
              onClick={startEditingMessage}
            />
          )}
        </MessageActions>
      )}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      <div
        ref={clamp.bodyRef}
        id={bodyId}
        className={`message-user-body${clamp.clamped ? ' is-clamped' : ''}`}
        style={clamp.overflows ? CLAMP_STYLE : undefined}
      >
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
              } else if (event.key === 'Escape') {
                event.preventDefault();
                setEditingId(null);
                setDraft('');
              }
            }}
            placeholder="Edit your message…"
            autoFocus
          />
        ) : (
          <Markdown content={message.content} />
        )}
      </div>
      {clamp.overflows && !isEditing && (
        <button
          type="button"
          className="message-user-toggle"
          aria-expanded={clamp.expanded}
          aria-controls={bodyId}
          onClick={() => clamp.setExpanded((value) => !value)}
        >
          {clamp.expanded ? 'Show less' : 'Show all'}
        </button>
      )}
      {isEditing && (
        <MessageEditBar
          onSave={saveEdit}
          onCancel={() => {
            setEditingId(null);
            setDraft('');
          }}
        />
      )}
    </div>
  );
}
