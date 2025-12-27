import type { StoreState, UIState, UIStatePartial } from '@/lib/store/types';
import { createStoreSlice } from '@/lib/store/createSlice';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { applyNextOverrides } from '@/lib/ui/next';

export const createUiSlice = createStoreSlice((set, get) => {
  const initial: UIState = buildDefaultUIState();

  return {
    ui: initial,
    setUI(partial: UIStatePartial) {
      set((s) => {
        const { overrides, flags, debug, search, tutor, plan, mobile, ...rest } = partial;
        const hasOverrides = Object.prototype.hasOwnProperty.call(partial, 'overrides');
        let nextUi: UIState = {
          ...s.ui,
          ...rest,
          flags: flags ? { ...s.ui.flags, ...flags } : s.ui.flags,
          debug: debug ? { ...s.ui.debug, ...debug } : s.ui.debug,
          search: search ? { ...s.ui.search, ...search } : s.ui.search,
          tutor: tutor ? { ...s.ui.tutor, ...tutor } : s.ui.tutor,
          plan: plan ? { ...s.ui.plan, ...plan } : s.ui.plan,
          mobile: mobile ? { ...s.ui.mobile, ...mobile } : s.ui.mobile,
        };
        if (hasOverrides) {
          nextUi =
            overrides && Object.keys(overrides).length > 0
              ? applyNextOverrides(nextUi, overrides)
              : { ...nextUi, overrides: undefined };
        }
        if (flags?.experimentalTutor === false) {
          nextUi.tutor = { ...nextUi.tutor, forceMode: false };
          nextUi = applyNextOverrides(nextUi, { tutorMode: false });
        }
        if (flags?.enableMultiModelChat === false) {
          nextUi = applyNextOverrides(nextUi, { parallelModels: undefined });
        }
        if (plan?.sheetOpen === false) {
          nextUi.plan = { ...nextUi.plan, sheetPlanOverride: null };
        }
        return { ui: nextUi };
      });
      if (partial.flags?.enableMultiModelChat === false) {
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
    setSearchStatus(messageId, entry) {
      if (!messageId) return;
      set((state) => ({
        ui: {
          ...state.ui,
          search: {
            ...state.ui.search,
            braveByMessageId: {
              ...(state.ui.search.braveByMessageId || {}),
              [messageId]: entry,
            },
          },
        },
      }));
    },
  } satisfies Partial<StoreState>;
});
