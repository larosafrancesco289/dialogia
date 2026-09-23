import React from 'react';

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  title?: string;
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

/** The shared bare icon button (styles/components/buttons.css). */
export function IconButton({
  children,
  onClick,
  title,
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
      aria-label={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
