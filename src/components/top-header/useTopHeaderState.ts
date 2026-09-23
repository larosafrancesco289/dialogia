import { useCallback, useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel } from '@/lib/models';
import { selectCurrentChat, selectIsTutorEnabled } from '@/lib/store/selectors';
import type { Chat } from '@/lib/types';

export type TopHeaderState = {
  chat?: Chat;
  collapsed: boolean;
  isSettingsOpen: boolean;
  tutorActive: boolean;
  tutorModelLabel: string;
  onToggleSidebar: () => void;
  onToggleSettings: () => void;
  onNewChat: () => void;
};

export function useTopHeaderState(): TopHeaderState {
  const {
    chat,
    setUI,
    newChat,
    collapsed,
    isSettingsOpen,
    tutorDefaultModelId,
    models,
    tutorActive,
  } = useChatStore(
    (s) => ({
      chat: selectCurrentChat(s),
      setUI: s.setUI,
      newChat: s.newChat,
      collapsed: s.ui.sidebarCollapsed ?? false,
      isSettingsOpen: s.ui.showSettings,
      tutorDefaultModelId: s.ui.tutor?.defaultModelId,
      models: s.models,
      tutorActive: selectIsTutorEnabled(s),
    }),
    shallow,
  );

  // The model picker shows which model a tutor turn will use. Both fields it reads
  // are core-declared settings, so the shell can resolve them without the module.
  const tutorModelId =
    chat?.settings?.features.tutor?.defaultModelId ||
    chat?.settings?.modelId ||
    tutorDefaultModelId;
  const tutorModelMeta = useMemo(() => findModelById(models, tutorModelId), [models, tutorModelId]);
  const tutorModelLabel = useMemo(
    () =>
      tutorModelId ? formatModelLabel({ model: tutorModelMeta, fallbackId: tutorModelId }) : '',
    [tutorModelMeta, tutorModelId],
  );

  const onToggleSidebar = useCallback(() => {
    setUI({ sidebarCollapsed: !collapsed });
  }, [collapsed, setUI]);

  const onToggleSettings = useCallback(() => {
    setUI({ showSettings: !isSettingsOpen });
  }, [isSettingsOpen, setUI]);

  const onNewChat = useCallback(() => {
    void newChat();
  }, [newChat]);

  return {
    chat,
    collapsed,
    isSettingsOpen,
    tutorActive,
    tutorModelLabel,
    onToggleSidebar,
    onToggleSettings,
    onNewChat,
  };
}
