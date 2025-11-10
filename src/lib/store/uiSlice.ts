import type { StoreState, UIState } from '@/lib/store/types';
import { createStoreSlice } from '@/lib/store/createSlice';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { applyNextOverrides, deriveNextPatchFromLegacy } from '@/lib/ui/next';

export const createUiSlice = createStoreSlice((set, get) => {
  const initial: UIState = buildDefaultUIState();

  return {
    ui: initial,
    setUI(partial: Partial<UIState>) {
      set((s) => {
        const { next: nextPatch, ...rest } = partial;
        let nextUi: UIState = { ...s.ui, ...rest };
        if (nextPatch) {
          nextUi = applyNextOverrides(nextUi, nextPatch);
        }
        const legacyPatch = deriveNextPatchFromLegacy(partial);
        if (Object.keys(legacyPatch).length > 0) {
          nextUi = applyNextOverrides(nextUi, legacyPatch);
        }
        if (partial.experimentalTutor === false) {
          nextUi.forceTutorMode = false;
          nextUi = applyNextOverrides(nextUi, { tutorMode: false });
        }
        if (partial.enableMultiModelChat === false) {
          nextUi = applyNextOverrides(nextUi, { parallelModels: undefined });
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
