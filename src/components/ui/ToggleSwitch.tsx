'use client';
import { motion } from 'framer-motion';
import { useId } from 'react';
import { springs } from '@/lib/mobile/springConfig';

export type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: 'sm' | 'md';
};

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = 'md',
}: ToggleSwitchProps) {
  const id = useId();
  const isSmall = size === 'sm';

  const trackWidth = isSmall ? 36 : 44;
  const trackHeight = isSmall ? 20 : 26;
  const thumbSize = isSmall ? 16 : 22;
  const thumbOffset = 2;
  const thumbTravel = trackWidth - thumbSize - thumbOffset * 2;

  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const toggle = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className="toggle-switch"
      data-checked={checked}
      data-size={size}
      style={{
        width: trackWidth,
        height: trackHeight,
      }}
    >
      <motion.span
        className="toggle-switch-thumb"
        animate={{
          x: checked ? thumbTravel : 0,
        }}
        transition={springs.snappy}
        style={{
          width: thumbSize,
          height: thumbSize,
          top: thumbOffset,
          left: thumbOffset,
        }}
      />
    </button>
  );

  if (!label) {
    return toggle;
  }

  return (
    <div className="toggle-switch-wrapper">
      <div className="toggle-switch-content">
        <label htmlFor={id} className="toggle-switch-label">
          {label}
        </label>
        {description && <p className="toggle-switch-description">{description}</p>}
      </div>
      {toggle}
    </div>
  );
}
