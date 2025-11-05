import type { StoreState, UIState } from '@/lib/store/types';
import { createStoreSlice } from '@/lib/store/createSlice';
import { buildDefaultUIState } from '@/lib/ui/defaults';

export const createUiSlice = createStoreSlice((set, get) => {
  const initial: UIState = buildDefaultUIState();

  return {
    ui: initial,
    setUI(partial: Partial<UIState>) {
      set((s) => {
        const nextUi: UIState = { ...s.ui, ...partial };
        if (partial.experimentalTutor === false) {
          nextUi.forceTutorMode = false;
          nextUi.nextTutorMode = false;
        }
        if (partial.enableMultiModelChat === false) {
          nextUi.nextParallelModels = undefined;
        }
        if (partial.planSheetOpen === false) {
          nextUi.planSheetPlanOverride = null;
        }
        return { ui: nextUi };
      });
      if (partial.enableMultiModelChat === false) {
        const { selectedChatId, chats, updateChatSettings } = get();
        if (!selectedChatId || typeof updateChatSettings !== 'function') return;
        const activeChat = chats.find((chat) => chat.id === selectedChatId);
        if (
          !activeChat ||
          !Array.isArray(activeChat.settings.parallel_models) ||
          activeChat.settings.parallel_models.length === 0
        ) {
          return;
        }
        void updateChatSettings({ parallel_models: [] });
      }
    },
  } satisfies Partial<StoreState>;
});
