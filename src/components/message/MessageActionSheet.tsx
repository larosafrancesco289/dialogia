import {
  ArrowPathIcon,
  ArrowUturnRightIcon,
  ClipboardIcon,
  PencilSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { Message } from '@/lib/types';
import { DialogOverlay, DialogPortal, DialogSurface } from '@/components/ui/Dialog';

export type MessageActionSheetProps = {
  isMobile: boolean;
  mobileSheet: { id: string; role: 'assistant' | 'user' } | null;
  mobileActionMessage: Message | null;
  mobileActionPreview: string | null;
  editingId: string | null;
  isStreaming: boolean;
  onClose: () => void;
  onCopy: (messageId: string) => Promise<void> | void;
  onStartEditing: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
};

export function MessageActionSheet({
  isMobile,
  mobileSheet,
  mobileActionMessage,
  mobileActionPreview,
  editingId,
  isStreaming,
  onClose,
  onCopy,
  onStartEditing,
  onBranch,
  onRegenerate,
}: MessageActionSheetProps) {
  if (!isMobile || !mobileSheet) return null;

  return (
    <DialogPortal>
      <DialogOverlay
        className="mobile-sheet-overlay mobile-message-sheet-overlay"
        role="presentation"
        onClose={onClose}
      >
        <DialogSurface
          className="mobile-sheet card mobile-message-sheet"
          role="menu"
          ariaLabel="Message actions"
          ariaModal={false}
        >
          <div className="mobile-sheet-handle" aria-hidden="true" />
          <div className="mobile-message-sheet__header">
            <div className="mobile-message-sheet__title">
              <span className="mobile-message-sheet__heading">Message actions</span>
              {mobileActionPreview && (
                <p className="mobile-message-sheet__preview">{mobileActionPreview}</p>
              )}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close actions"
              onClick={onClose}
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="mobile-message-sheet__actions">
            <button
              type="button"
              className="mobile-message-action"
              onClick={async () => {
                await onCopy(mobileSheet.id);
                onClose();
              }}
            >
              <span className="mobile-message-action__icon">
                <ClipboardIcon className="h-5 w-5" />
              </span>
              <span className="mobile-message-action__meta">
                <span className="mobile-message-action__label">Copy</span>
                <span className="mobile-message-action__hint">Copy message text</span>
              </span>
            </button>
            {mobileActionMessage && (
              <button
                type="button"
                className="mobile-message-action"
                disabled={editingId === mobileActionMessage.id}
                onClick={() => {
                  if (editingId === mobileActionMessage.id) return;
                  onStartEditing(mobileActionMessage.id);
                  onClose();
                }}
              >
                <span className="mobile-message-action__icon">
                  <PencilSquareIcon className="h-5 w-5" />
                </span>
                <span className="mobile-message-action__meta">
                  <span className="mobile-message-action__label">
                    {editingId === mobileActionMessage.id ? 'Editing...' : 'Edit'}
                  </span>
                  <span className="mobile-message-action__hint">Modify this message</span>
                </span>
              </button>
            )}
            {mobileSheet.role === 'assistant' && (
              <>
                <button
                  type="button"
                  className="mobile-message-action"
                  disabled={isStreaming}
                  onClick={() => {
                    if (isStreaming) return;
                    onBranch(mobileSheet.id);
                    onClose();
                  }}
                >
                  <span className="mobile-message-action__icon">
                    <ArrowUturnRightIcon className="h-5 w-5" />
                  </span>
                  <span className="mobile-message-action__meta">
                    <span className="mobile-message-action__label">Branch</span>
                    <span className="mobile-message-action__hint">Start a new chat from here</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="mobile-message-action"
                  onClick={() => {
                    onRegenerate(mobileSheet.id);
                    onClose();
                  }}
                >
                  <span className="mobile-message-action__icon">
                    <ArrowPathIcon className="h-5 w-5" />
                  </span>
                  <span className="mobile-message-action__meta">
                    <span className="mobile-message-action__label">Regenerate</span>
                    <span className="mobile-message-action__hint">Ask the assistant again</span>
                  </span>
                </button>
              </>
            )}
          </div>
          <button type="button" className="btn btn-ghost w-full h-11" onClick={onClose}>
            Cancel
          </button>
        </DialogSurface>
      </DialogOverlay>
    </DialogPortal>
  );
}
