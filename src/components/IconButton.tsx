import React from 'react';

interface IconButtonProps {
  children: React.ReactNode;
  onClick?: (e?: React.MouseEvent) => void;
  title?: string;
  variant?: 'ghost' | 'subtle';
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

export default function IconButton({
  children,
  onClick,
  title,
  variant = 'ghost',
  size = 'md',
  className = '',
  disabled = false,
}: IconButtonProps) {
  const baseClasses = 'inline-flex items-center justify-center border-none cursor-pointer transition-all duration-200 rounded-full shadow-sm';
  
  const variantClasses = {
    ghost: 'bg-transparent hover:bg-muted active:bg-border text-muted-foreground hover:text-fg',
    subtle: 'bg-muted/50 hover:bg-muted active:bg-border text-muted-foreground hover:text-fg',
  };
  
  const sizeClasses = {
    sm: 'w-7 h-7 text-sm',
    md: 'w-9 h-9',
  };
  
  const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';
  
  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${disabledClasses} ${className}`}
      onClick={(e) => onClick?.(e)}
      title={title}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
