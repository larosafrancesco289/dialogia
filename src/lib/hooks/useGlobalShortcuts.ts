import { useEffect } from 'react';
import { useChatStore } from '@/lib/store';
import { selectIsStreaming } from '@/lib/store/selectors';
import { isModalOpen } from '@/lib/hooks/useModalFocus';
import { isOtherEditableTarget, resolveGlobalShortcut } from '@/lib/ui/globalShortcuts';

/**
 * Registers desktop app-level shortcuts:
 * - Cmd/Ctrl+K: toggle quick search across chats and messages
 * - Cmd/Ctrl+Shift+O: start a new chat
 * - Cmd/Ctrl+B: toggle sidebar
 * - Cmd/Ctrl+,: toggle Settings
 * - Escape: stop an active reply when no modal or inline edit is open
 */
export function useGlobalShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const state = useChatStore.getState();
      const action = resolveGlobalShortcut(event, {
        modalOpen: isModalOpen(),
        quickSearchOpen: state.ui.quickSearchOpen === true,
        settingsOpen: state.ui.showSettings === true,
        isStreaming: selectIsStreaming(state),
        inOtherEditable: isOtherEditableTarget(event.target),
      });
      if (!action) return;

      event.preventDefault();
      switch (action) {
        case 'toggleQuickSearch':
          state.setUI({ quickSearchOpen: !state.ui.quickSearchOpen });
          break;
        case 'newChat':
          void state.newChat();
          break;
        case 'toggleSidebar':
          state.setUI({
            sidebarCollapsed: !(state.ui.sidebarCollapsed ?? false),
            sidebarFoldedByLayout: false,
          });
          break;
        case 'toggleSettings':
          state.setUI({ showSettings: !state.ui.showSettings });
          break;
        case 'stopStreaming':
          state.stopStreaming();
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
