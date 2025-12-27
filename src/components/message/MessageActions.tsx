import type { ReactNode } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import styles from './MessageCard.module.css';

type MessageActionsProps = {
  isEditing: boolean;
  isMobile: boolean;
  onSave: () => void;
  onCancel: () => void;
  children: ReactNode;
};

export function MessageActions({
  isEditing,
  isMobile,
  onSave,
  onCancel,
  children,
}: MessageActionsProps) {
  return (
    <div
      className={`${styles.actions} message-actions`}
      style={isMobile ? { opacity: 1 } : undefined}
    >
      {isEditing ? (
        <div className="message-actions__group">
          <button
            className="message-action-btn"
            aria-label="Save edit"
            title="Save edit"
            onClick={onSave}
          >
            <CheckIcon className="h-4 w-4" />
          </button>
          <button
            className="message-action-btn"
            aria-label="Cancel edit"
            title="Cancel edit"
            onClick={onCancel}
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="message-actions__group">{children}</div>
      )}
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
