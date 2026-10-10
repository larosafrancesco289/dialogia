import { useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useTutorModel } from '@/lib/hooks/useTutorModel';
import { selectCurrentChat, selectIsTutorEnabled } from '@/lib/store/selectors';
import type { Chat } from '@/lib/types';

export type TopHeaderState = {
  chat?: Chat;
  collapsed: boolean;
  isSettingsOpen: boolean;
  isMemoryOpen: boolean;
  tutorActive: boolean;
  tutorModelLabel: string;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onToggleMemory: () => void;
  onNewChat: () => void;
};

export function useTopHeaderState(): TopHeaderState {
  const { chat, setUI, newChat, collapsed, isSettingsOpen, isMemoryOpen, tutorActive } =
    useChatStore(
      (s) => ({
        chat: selectCurrentChat(s),
        setUI: s.setUI,
        newChat: s.newChat,
        collapsed: s.ui.sidebarCollapsed ?? false,
        isSettingsOpen: s.ui.showSettings,
        isMemoryOpen: s.ui.memoryOpen ?? false,
        tutorActive: selectIsTutorEnabled(s),
      }),
      shallow,
    );

  // The model picker shows which model a tutor turn will use. The fields it reads
  // are core-declared settings, so the shell can resolve them without the module.
  const tutorModelLabel = useTutorModel().label;

  const onToggleSidebar = useCallback(() => {
    // The reader's own choice replaces any fold the window made.
    setUI({ sidebarCollapsed: !collapsed, sidebarFoldedByLayout: false });
  }, [collapsed, setUI]);

  const onToggleSettings = useCallback(() => {
    setUI({ showSettings: !isSettingsOpen });
  }, [isSettingsOpen, setUI]);

  const onToggleMemory = useCallback(() => {
    setUI({ memoryOpen: !isMemoryOpen });
  }, [isMemoryOpen, setUI]);

  const onNewChat = useCallback(() => {
    void newChat();
  }, [newChat]);

  return {
    chat,
    collapsed,
    isSettingsOpen,
    isMemoryOpen,
    tutorActive,
    tutorModelLabel,
    onToggleSidebar,
    onToggleMemory,
    onToggleSettings,
    onNewChat,
  };
}
