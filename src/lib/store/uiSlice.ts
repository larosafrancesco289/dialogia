import type { StoreState, UIState, UIStatePartial } from '@/lib/store/types';
import { createStoreSlice } from '@/lib/store/createSlice';
import { buildDefaultUIState } from '@/lib/ui/defaults';
import { applyNextOverrides } from '@/lib/ui/next';
import { resolveNotice } from '@/lib/store/notices';
import { mergeChatDefaults } from '@/lib/settings/chatDefaults';

export const createUiSlice = createStoreSlice((set) => {
  const initial: UIState = buildDefaultUIState();

  return {
    ui: initial,
    setUI(partial: UIStatePartial) {
      set((s) => {
        const { overrides, flags, debug, search, tutor, plan, mobile, chatDefaults, ...rest } =
          partial;
        const hasOverrides = Object.prototype.hasOwnProperty.call(partial, 'overrides');
        let nextUi: UIState = {
          ...s.ui,
          ...rest,
          chatDefaults: mergeChatDefaults(s.ui.chatDefaults, chatDefaults),
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
        if (plan?.sheetOpen === false) {
          nextUi.plan = { ...nextUi.plan, sheetPlanOverride: null };
        }
        return { ui: nextUi };
      });
    },
    setNotice(notice) {
      const resolved = resolveNotice(notice);
      set((state) => ({
        ui: {
          ...state.ui,
          notice: resolved,
        },
      }));
    },
    setSearchStatus(messageId, entry) {
      if (!messageId) return;
      set((state) => ({
        ui: {
          ...state.ui,
          search: {
            ...state.ui.search,
            tavilyByMessageId: {
              ...(state.ui.search.tavilyByMessageId || {}),
              [messageId]: entry,
            },
          },
        },
      }));
    },
  } satisfies Partial<StoreState>;
});
