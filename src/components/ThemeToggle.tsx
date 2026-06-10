'use client';
import { useMemo } from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { applyThemeClass, useThemeMode, type ThemeMode } from '@/lib/hooks/useThemeMode';

export type { ThemeMode };

export function applyTheme(mode: ThemeMode) {
  applyThemeClass(mode);
}

/** Initialize theme from localStorage - call once on app mount */
export function initializeTheme() {
  const saved = (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto';
  applyThemeClass(saved);
}

type ThemeToggleProps = {
  variant?: 'ghost' | 'menu' | 'icon';
  className?: string;
  onToggle?: (next: ThemeMode) => void;
};

export function ThemeToggle({ variant = 'ghost', className = '', onToggle }: ThemeToggleProps) {
  const [mode, setMode] = useThemeMode();

  const cycle = () => {
    const next: ThemeMode = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
    setMode(next);
    onToggle?.(next);
  };

  const icon = useMemo(() => {
    if (mode === 'auto') return <ComputerDesktopIcon className="h-5 w-5" />;
    if (mode === 'dark') return <MoonIcon className="h-5 w-5" />;
    return <SunIcon className="h-5 w-5" />;
  }, [mode]);

  const label = `Theme: ${mode === 'auto' ? 'Auto' : mode === 'dark' ? 'Dark' : 'Light'}`;

  if (variant === 'menu') {
    return (
      <button
        type="button"
        className={`menu-item w-full flex items-center justify-between gap-3 ${className}`.trim()}
        onClick={cycle}
        aria-label={label}
      >
        <span>{label}</span>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">{icon}</span>
      </button>
    );
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className={`icon-button ${className}`.trim()}
        onClick={cycle}
        aria-label={label}
        aria-pressed={mode !== 'auto'}
        title={`${label} (tap to cycle)`}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`btn btn-ghost ${className}`.trim()}
      onClick={cycle}
      aria-label={label}
      aria-pressed={mode !== 'auto'}
      title={`${label} (click to cycle)`}
    >
      {icon}
    </button>
  );
}
