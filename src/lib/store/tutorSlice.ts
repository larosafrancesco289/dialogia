import type { StoreState } from '@/lib/store/types';
import type { TutorEvent, TutorProfile } from '@/lib/types';
import { updateTutorProfile, loadTutorProfile } from '@/lib/tutorProfile';

export function createTutorSlice(
  set: (updater: (s: StoreState) => Partial<StoreState> | void) => void,
  get: () => StoreState,
) {
  return {
    async logTutorResult(evt: TutorEvent) {
      const chatId = get().selectedChatId!;
      if (!chatId) return;
      const prof = await updateTutorProfile(chatId, evt);
      set((s) => ({
        ui: {
          ...s.ui,
          tutorProfileByChatId: { ...(s.ui.tutorProfileByChatId || {}), [chatId]: prof },
        },
      }));
    },
    async loadTutorProfileIntoUI(chatId?: string) {
      const id = chatId || get().selectedChatId!;
      if (!id) return;
      const prof = await loadTutorProfile(id);
      if (prof)
        set((s) => ({
          ui: {
            ...s.ui,
            tutorProfileByChatId: { ...(s.ui.tutorProfileByChatId || {}), [id]: prof },
          },
        }));
    },
  } satisfies Partial<StoreState>;
}
