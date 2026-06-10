'use client';

import { useSyncExternalStore } from 'react';

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'theme';
const TRANSITION_CLASS = 'theme-transition';
const TRANSITION_MS = 240;

let currentMode: ThemeMode | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;
let globalListenersAttached = false;
const listeners = new Set<() => void>();

function readStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'auto';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // ignore storage access failures
  }
  return 'auto';
}

function getMode(): ThemeMode {
  if (currentMode === null) currentMode = readStoredMode();
  return currentMode;
}

const getServerMode = (): ThemeMode => 'auto';

/**
 * Apply the resolved theme class to the root element. When `smooth` is true a
 * short-lived class enables color transitions so the palette cross-fades
 * instead of hard-cutting (see foundations.css).
 */
export function applyThemeClass(mode: ThemeMode, options?: { smooth?: boolean }) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
  if (root.classList.contains('dark') === isDark) return;
  if (options?.smooth) {
    root.classList.add(TRANSITION_CLASS);
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      transitionTimer = null;
      root.classList.remove(TRANSITION_CLASS);
    }, TRANSITION_MS);
  }
  root.classList.toggle('dark', isDark);
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function setThemeMode(next: ThemeMode) {
  currentMode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore storage access failures
  }
  applyThemeClass(next, { smooth: true });
  emit();
}

function ensureGlobalListeners() {
  if (globalListenersAttached || typeof window === 'undefined') return;
  globalListenersAttached = true;
  window.addEventListener('storage', (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    currentMode = readStoredMode();
    applyThemeClass(getMode(), { smooth: true });
    emit();
  });
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  mql.addEventListener?.('change', () => {
    if (getMode() === 'auto') applyThemeClass('auto', { smooth: true });
  });
}

function subscribe(listener: () => void) {
  ensureGlobalListeners();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Shared theme mode state. All consumers (header toggle, mobile menu,
 * settings panel) stay in sync, including across tabs.
 */
export function useThemeMode(): [ThemeMode, (next: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribe, getMode, getServerMode);
  return [mode, setThemeMode];
}
