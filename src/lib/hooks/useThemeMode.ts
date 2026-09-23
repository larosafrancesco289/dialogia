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
 * The browser's own chrome (Safari's toolbar, a home-screen app's status
 * bar) takes the page's paper, in the theme actually chosen: the static
 * theme-color tags only know the system's scheme, so a dark app under a
 * light system got a light bar.
 */
function syncThemeColor() {
  if (typeof document === 'undefined') return;
  const canvas = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-canvas')
    .trim();
  if (!canvas) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.removeAttribute('media');
    meta.setAttribute('content', canvas);
  });
}

/**
 * Apply the resolved theme class to the root element. When `smooth` is true
 * the palette cross-fades instead of hard-cutting: preferably via the View
 * Transitions API (one composited fade of the whole viewport), falling back
 * to a short-lived class that enables color transitions (see foundations.css).
 */
export function applyThemeClass(mode: ThemeMode, options?: { smooth?: boolean }) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
  if (root.classList.contains('dark') === isDark) {
    syncThemeColor();
    return;
  }
  const toggle = () => {
    root.classList.toggle('dark', isDark);
    syncThemeColor();
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // A hidden tab (another tab changed the theme) has nothing to animate, and
  // the browser aborts its transition with an unhandled rejection.
  if (!options?.smooth || reduceMotion || document.hidden) {
    toggle();
    return;
  }
  type Transition = { ready: Promise<void>; finished: Promise<void> };
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => Transition;
  };
  if (typeof doc.startViewTransition === 'function') {
    const transition = doc.startViewTransition(toggle);
    // An interrupted transition still applies the change; only the fade is
    // lost, so its rejection is not an error.
    transition.ready.catch(() => undefined);
    transition.finished.catch(() => undefined);
    return;
  }
  root.classList.add(TRANSITION_CLASS);
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    transitionTimer = null;
    root.classList.remove(TRANSITION_CLASS);
  }, TRANSITION_MS);
  toggle();
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

/**
 * At startup: the browser's bars take the chosen theme, and Auto follows the
 * system from the first moment. The listeners used to wait for something to
 * subscribe, which only Settings > Appearance does, so a phone switching to
 * dark at sunset left the app light until Settings had been opened.
 */
export function initThemeMode() {
  ensureGlobalListeners();
  syncThemeColor();
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
