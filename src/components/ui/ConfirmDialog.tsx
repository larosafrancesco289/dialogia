import { useRef } from 'react';
import { DialogOverlay, DialogPortal, DialogSurface } from '@/components/ui/Dialog';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useModalFocus } from '@/lib/hooks/useModalFocus';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** A destructive confirmation reads in crimson, not gold. */
  tone?: 'default' | 'danger';
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'danger',
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Back cancels, as Escape does, instead of closing what is behind it.
  useBackToClose(open, onCancel);

  // Enter is left to the focused button, so it answers what is focused:
  // Cancel, where focus starts, until the reader moves to the other one.
  useModalFocus(open, surfaceRef, { initialFocus: cancelRef, onEscape: onCancel });

  if (!open) return null;

  return (
    <DialogPortal>
      <DialogOverlay className="scrim z-[90]" onClose={onCancel}>
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <DialogSurface
            className="dialog dialog--rise max-w-sm"
            ariaLabel={title}
            surfaceRef={surfaceRef}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              // The dialog is portalled, but React bubbles its keys through
              // whatever rendered it: a dialog opened from Settings must not
              // close Settings on the same Escape.
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }}
          >
            <h2 className="dialog__title">{title}</h2>
            {description && <p className="dialog__lead">{description}</p>}
            <div className="dialog__actions">
              <button ref={cancelRef} className="btn-outline btn-sm" onClick={onCancel}>
                {cancelLabel}
              </button>
              <button
                className={`btn btn-sm${tone === 'danger' ? ' btn-danger' : ''}`}
                onClick={onConfirm}
              >
                {confirmLabel}
              </button>
            </div>
          </DialogSurface>
        </div>
      </DialogOverlay>
    </DialogPortal>
  );
}
