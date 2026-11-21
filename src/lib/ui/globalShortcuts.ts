// Module: ui/globalShortcuts
// Responsibility: Pure key-to-action resolution for desktop app-level keyboard
// shortcuts (quick search, new chat, sidebar toggle, settings, stop streaming).

import { COMPOSER_FIELD_SELECTOR } from '@/lib/ui/focus';

export type GlobalShortcutAction =
  | 'toggleQuickSearch'
  | 'newChat'
  | 'toggleSidebar'
  | 'toggleSettings'
  | 'stopStreaming';

export type ShortcutKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented?: boolean;
  isComposing?: boolean;
};

export type ShortcutContext = {
  modalOpen: boolean;
  quickSearchOpen: boolean;
  settingsOpen: boolean;
  isStreaming: boolean;
  /** Focus is inside an editable field other than the main chat composer. */
  inOtherEditable: boolean;
  /**
   * Apple platforms use Cmd as the shortcut modifier. Ctrl stays free there,
   * since Ctrl+B / Ctrl+K are the system's own text-editing keys.
   */
  apple: boolean;
};

/**
 * Decides which app-level shortcut (if any) a keydown event triggers.
 * Modifiers never fire with Alt held, and navigation shortcuts stay quiet
 * behind an open modal so they never clash with dialogs or text inputs.
 */
export function resolveGlobalShortcut(
  event: ShortcutKeyEvent,
  ctx: ShortcutContext,
): GlobalShortcutAction | null {
  if (event.defaultPrevented || event.isComposing || event.altKey) return null;

  const mod = ctx.apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  const key = event.key.toLowerCase();

  if (mod && !event.shiftKey && key === 'k') {
    if (!ctx.modalOpen || ctx.quickSearchOpen) return 'toggleQuickSearch';
    return null;
  }

  if (mod && !event.shiftKey && event.key === ',') {
    if (!ctx.modalOpen || ctx.settingsOpen) return 'toggleSettings';
    return null;
  }

  if (mod && event.shiftKey && key === 'o') {
    return ctx.modalOpen ? null : 'newChat';
  }

  if (mod && !event.shiftKey && key === 'b') {
    return ctx.modalOpen || ctx.inOtherEditable ? null : 'toggleSidebar';
  }

  if (event.key === 'Escape' && !mod && !event.shiftKey) {
    if (!ctx.modalOpen && !ctx.inOtherEditable && ctx.isStreaming) return 'stopStreaming';
  }

  return null;
}

/** Whether `target` is an editable control other than the main chat composer. */
export function isOtherEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return false;
  }
  if (target.matches(COMPOSER_FIELD_SELECTOR)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** Whether this browser runs on an Apple platform, where Cmd is the shortcut modifier. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Platform-appropriate modifier glyph for tooltips (`⌘` on Apple, `Ctrl+` elsewhere). */
export function modKeyPrefix(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl+';
}
