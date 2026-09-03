import { PencilSquareIcon, CheckIcon, ClipboardIcon } from '@heroicons/react/24/outline';
import { Markdown } from '@/components/Markdown';
import { MessageActions, ActionButton } from '@/components/message/MessageActions';
import { MessageAttachments } from '@/components/message/MessageAttachments';
import type { Message, PersistedAttachment } from '@/lib/types';

export type UserMessageProps = {
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
};

export function UserMessage({
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
}: UserMessageProps) {
  return (
    <div>
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
            icon={
              copiedId === message.id ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <ClipboardIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              )
            }
            title={copiedId === message.id ? 'Copied!' : 'Copy message'}
            ariaLabel="Copy message"
            onClick={copyMessage}
            showFeedback={copiedId === message.id}
          />
        </MessageActions>
      )}

      <MessageAttachments attachments={attachments} onOpenLightbox={setLightbox} />

      <div className="message-user-body">
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
