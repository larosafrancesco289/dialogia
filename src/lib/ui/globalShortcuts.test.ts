import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGlobalShortcut, type ShortcutContext } from '@/lib/ui/globalShortcuts';

const baseCtx: ShortcutContext = {
  modalOpen: false,
  quickSearchOpen: false,
  settingsOpen: false,
  isStreaming: false,
  inOtherEditable: false,
  apple: true,
};
const pcCtx: ShortcutContext = { ...baseCtx, apple: false };

const key = (
  k: string,
  mods: Partial<{
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    defaultPrevented: boolean;
    isComposing: boolean;
  }> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

test('Cmd/Ctrl+K toggles quick search, and closes it when it is the open modal', () => {
  assert.equal(resolveGlobalShortcut(key('k', { metaKey: true }), baseCtx), 'toggleQuickSearch');
  assert.equal(resolveGlobalShortcut(key('K', { ctrlKey: true }), pcCtx), 'toggleQuickSearch');
  assert.equal(
    resolveGlobalShortcut(key('k', { metaKey: true }), {
      ...baseCtx,
      modalOpen: true,
      quickSearchOpen: true,
    }),
    'toggleQuickSearch',
  );
  assert.equal(
    resolveGlobalShortcut(key('k', { metaKey: true }), { ...baseCtx, modalOpen: true }),
    null,
  );
});

test('Cmd/Ctrl+Shift+O starts a new chat when no modal is open', () => {
  assert.equal(
    resolveGlobalShortcut(key('o', { metaKey: true, shiftKey: true }), baseCtx),
    'newChat',
  );
  assert.equal(
    resolveGlobalShortcut(key('O', { ctrlKey: true, shiftKey: true }), {
      ...pcCtx,
      modalOpen: true,
    }),
    null,
  );
});

test('Cmd/Ctrl+B toggles the sidebar outside modals and other inputs', () => {
  assert.equal(resolveGlobalShortcut(key('b', { metaKey: true }), baseCtx), 'toggleSidebar');
  assert.equal(
    resolveGlobalShortcut(key('b', { metaKey: true }), { ...baseCtx, inOtherEditable: true }),
    null,
  );
});

test('Cmd/Ctrl+, toggles Settings', () => {
  assert.equal(resolveGlobalShortcut(key(',', { metaKey: true }), baseCtx), 'toggleSettings');
  assert.equal(
    resolveGlobalShortcut(key(',', { ctrlKey: true }), {
      ...pcCtx,
      modalOpen: true,
      settingsOpen: true,
    }),
    'toggleSettings',
  );
});

test('Escape stops an active reply when no modal or inline edit is open', () => {
  assert.equal(resolveGlobalShortcut(key('Escape'), baseCtx), null);
  assert.equal(
    resolveGlobalShortcut(key('Escape'), { ...baseCtx, isStreaming: true }),
    'stopStreaming',
  );
  assert.equal(
    resolveGlobalShortcut(key('Escape'), { ...baseCtx, isStreaming: true, modalOpen: true }),
    null,
  );
  assert.equal(
    resolveGlobalShortcut(key('Escape'), { ...baseCtx, isStreaming: true, inOtherEditable: true }),
    null,
  );
  assert.equal(
    resolveGlobalShortcut(key('Escape', { defaultPrevented: true }), {
      ...baseCtx,
      isStreaming: true,
    }),
    null,
  );
});

test('Ctrl is left to text editing on Apple platforms, and Cmd does nothing elsewhere', () => {
  // Ctrl+B / Ctrl+K move back a character and kill to end of line in macOS text fields.
  assert.equal(resolveGlobalShortcut(key('b', { ctrlKey: true }), baseCtx), null);
  assert.equal(resolveGlobalShortcut(key('k', { ctrlKey: true }), baseCtx), null);
  assert.equal(resolveGlobalShortcut(key('k', { metaKey: true }), pcCtx), null);
  assert.equal(resolveGlobalShortcut(key('b', { ctrlKey: true }), pcCtx), 'toggleSidebar');
});
