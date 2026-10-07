import { useEffect, useRef, type ReactNode } from 'react';
import styles from './MessageCard.module.css';
import { useT } from '@/lib/i18n';

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

/** The key held with Enter to save or send: ⌘ on Apple devices, Ctrl elsewhere. */
export const ENTER_MODIFIER =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '⌘'
    : 'Ctrl';

/** Save and cancel under a message being edited, with the shortcut named. */
export function MessageEditBar({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  // Brought into view when editing starts: under the latest reply it would
  // otherwise sit behind the composer.
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reveal = () => barRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    // A frame later, so the field's autofocus has finished its own scroll.
    const frame = requestAnimationFrame(reveal);
    // And again once a phone's keyboard has risen, which left the buttons
    // under its edge.
    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reveal, 320);
    };
    window.visualViewport?.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, []);
  return (
    <div ref={barRef} className="message-edit-bar">
      <span className="message-edit-bar__hint">
        {t('message.saveShortcut', { key: ENTER_MODIFIER })}
      </span>
      <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
        {t('common.cancel')}
      </button>
      <button type="button" className="btn btn-sm" onClick={onSave}>
        {t('common.save')}
      </button>
    </div>
  );
}

type ActionButtonProps = {
  icon: ReactNode;
  title: string;
  ariaLabel?: string;
  /** A name for code to find the button by, whatever language it is labelled in. */
  action?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  showFeedback?: boolean;
};

export function ActionButton({
  icon,
  title,
  ariaLabel,
  action,
  onClick,
  disabled,
  className,
  showFeedback,
}: ActionButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--sm ${showFeedback ? 'is-success' : ''} ${className ?? ''}`.trim()}
      aria-label={ariaLabel ?? title}
      data-action={action}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}
