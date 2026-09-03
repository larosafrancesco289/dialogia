import type { ReactNode } from 'react';
import { DialogOverlay, DialogPortal, DialogSurface } from '@/components/ui/Dialog';

type RowActionSheetProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export function RowActionSheet({ open, label, onClose, children }: RowActionSheetProps) {
  if (!open) return null;
  return (
    <DialogPortal>
      <DialogOverlay className="mobile-sheet-overlay" role="presentation" onClose={onClose}>
        <DialogSurface
          className="mobile-sheet card mobile-sheet-compact"
          role="menu"
          ariaLabel={label}
          ariaModal={false}
        >
          <div className="mobile-sheet-handle" aria-hidden="true" />
          {children}
        </DialogSurface>
      </DialogOverlay>
    </DialogPortal>
  );
}
