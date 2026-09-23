import { useEffect, useRef, type ReactNode } from 'react';
import styles from './MessageCard.module.css';

/**
 * Your message's actions: copy and edit, under the bubble on the right,
 * shown on hover. Hidden while editing; the edit bar takes over.
 */
export function MessageActions({
  isEditing,
  isMobile,
  children,
}: {
  isEditing: boolean;
  isMobile: boolean;
  children: ReactNode;
}) {
  if (isEditing) return null;
  return (
    <div
      className={`${styles.actions} message-actions`}
      style={isMobile ? { opacity: 1, pointerEvents: 'auto' } : undefined}
    >
      <div className="message-actions__group">{children}</div>
    </div>
  );
}

const SAVE_SHORTCUT =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘ Enter to save'
    : 'Ctrl Enter to save';

/** Save and cancel under a message being edited, with the shortcut named. */
export function MessageEditBar({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  // Brought into view when editing starts: under the latest reply it would
  // otherwise sit behind the composer.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A frame later, so the field's autofocus has finished its own scroll.
    const frame = requestAnimationFrame(() =>
      barRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div ref={barRef} className="message-edit-bar">
      <span className="message-edit-bar__hint">{SAVE_SHORTCUT}</span>
      <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
        Cancel
      </button>
      <button type="button" className="btn btn-sm" onClick={onSave}>
        Save
      </button>
    </div>
  );
}

type ActionButtonProps = {
  icon: ReactNode;
  title: string;
  ariaLabel?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  showFeedback?: boolean;
};

export function ActionButton({
  icon,
  title,
  ariaLabel,
  onClick,
  disabled,
  className,
  showFeedback,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`message-action-btn ${showFeedback ? 'is-success' : ''} ${className ?? ''}`.trim()}
      aria-label={ariaLabel ?? title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}
