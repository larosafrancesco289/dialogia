'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';

export type ThemeMode = 'auto' | 'light' | 'dark';

type ThemeToggleProps = {
  variant?: 'ghost' | 'menu';
  className?: string;
  onToggle?: (next: ThemeMode) => void;
};

function applyTheme(mode: ThemeMode, mql?: MediaQueryList | null) {
  const root = document.documentElement;
  const prefersDark = mql ? mql.matches : window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
  root.classList.toggle('dark', isDark);
}

export default function ThemeToggle({ variant = 'ghost', className = '', onToggle }: ThemeToggleProps) {
  const [mode, setMode] = useState<ThemeMode>('auto');
  const mqlRef = useRef<MediaQueryList | null>(null);

  useEffect(() => {
    // Initialize from localStorage or system
    const saved = (localStorage.getItem('theme') as ThemeMode | null) ?? 'auto';
    setMode(saved);
    mqlRef.current = window.matchMedia('(prefers-color-scheme: dark)');
    applyTheme(saved, mqlRef.current);
    const listener = () => {
      if (saved === 'auto') applyTheme('auto', mqlRef.current);
    };
    mqlRef.current.addEventListener?.('change', listener as any);
    return () => mqlRef.current?.removeEventListener?.('change', listener as any);
  }, []);

  const cycle = () => {
    setMode((prev) => {
      const next: ThemeMode = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      localStorage.setItem('theme', next);
      applyTheme(next, mqlRef.current);
      onToggle?.(next);
      return next;
    });
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
