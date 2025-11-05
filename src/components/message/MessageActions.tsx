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
      className={`${styles.actions} absolute bottom-2 right-2 z-30 transition-opacity`}
      style={isMobile ? { opacity: 1 } : undefined}
    >
      {isEditing ? (
        <div className="flex items-center gap-1">
          <button className="icon-button" aria-label="Save edit" title="Save edit" onClick={onSave}>
            <CheckIcon className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
          <button className="icon-button" aria-label="Cancel edit" title="Cancel edit" onClick={onCancel}>
            <XMarkIcon className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">{children}</div>
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
};

export function ActionButton({
  icon,
  title,
  ariaLabel,
  onClick,
  disabled,
  className,
}: ActionButtonProps) {
  return (
    <button
      className={`icon-button ${className ?? ''}`.trim()}
      aria-label={ariaLabel ?? title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}
