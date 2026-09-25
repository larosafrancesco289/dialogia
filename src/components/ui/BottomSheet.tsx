import { useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { DialogPortal } from '@/components/ui/Dialog';
import { motionTransition } from '@/lib/ui/motion';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { useModalFocus } from '@/lib/hooks/useModalFocus';

type BottomSheetProps = {
  open: boolean;
  /** What the sheet is about, for assistive tech and, if no title, nothing else. */
  label: string;
  /** A quiet line at the top naming what the actions act on. */
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** A panel that needs the height (the Learning Hub) rather than a menu. */
  tall?: boolean;
};

/**
 * The phone's one sheet: paper rising from the bottom edge over a scrim,
 * with a handle you can pull down to put it away. Row menus, message
 * actions and pickers all use it, so they all look and move alike.
 */
export function BottomSheet({
  open,
  label,
  title,
  onClose,
  children,
  tall = false,
}: BottomSheetProps) {
  const reducedMotion = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  // Pulled down by its head, so a long list in the body still scrolls.
  const dragControls = useDragControls();
  useBackToClose(open, onClose);
  // Focus comes in, stays in, and goes back to where the reader was.
  useModalFocus(open, sheetRef, { onEscape: onClose });

  const slide = reducedMotion ? { duration: 0 } : motionTransition.layout;

  return (
    <DialogPortal>
      <AnimatePresence>
        {open && (
          <div className="bottom-sheet-layer" key="sheet">
            <motion.div
              className="bottom-sheet-scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={reducedMotion ? { duration: 0 } : motionTransition.quick}
              onClick={onClose}
              aria-hidden="true"
            />
            <motion.div
              ref={sheetRef}
              className={`bottom-sheet${tall ? ' bottom-sheet--tall' : ''}`}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={slide}
              drag="y"
              dragControls={dragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 80 || info.velocity.y > 500) onClose();
              }}
            >
              <div className="bottom-sheet__head" onPointerDown={(e) => dragControls.start(e)}>
                <button
                  type="button"
                  className="bottom-sheet__handle"
                  aria-label="Close"
                  onClick={onClose}
                >
                  <span aria-hidden="true" />
                </button>
                {title && <div className="bottom-sheet__title">{title}</div>}
              </div>
              <div className="bottom-sheet__body">{children}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </DialogPortal>
  );
}

/** One row in a sheet: an icon and a label, a thumb tall. */
export function SheetItem({
  icon,
  children,
  onClick,
  danger = false,
  selected = false,
  disabled = false,
  indent = 0,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
  indent?: number;
}) {
  return (
    <button
      type="button"
      className={`sheet-item${danger ? ' is-danger' : ''}${selected ? ' is-selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-current={selected ? 'true' : undefined}
      style={indent ? { paddingLeft: `calc(${indent} * 1.25rem + var(--space-4))` } : undefined}
    >
      {icon && (
        <span className="sheet-item__icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="sheet-item__label">{children}</span>
    </button>
  );
}
