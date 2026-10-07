import React from 'react';

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  title?: string;
  /** The name a screen reader gives it, when the tooltip alone would not tell rows apart. */
  ariaLabel?: string;
  /** A name for code to find the button by, whatever language it is labelled in. */
  action?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

/** The shared bare icon button (styles/components/buttons.css). */
export function IconButton({
  children,
  onClick,
  title,
  ariaLabel,
  action,
  size = 'md',
  className = '',
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button${size === 'sm' ? ' icon-button--sm' : ''} ${className}`.trim()}
      onClick={(e) => onClick?.(e)}
      title={title}
      aria-label={ariaLabel ?? title}
      data-action={action}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
