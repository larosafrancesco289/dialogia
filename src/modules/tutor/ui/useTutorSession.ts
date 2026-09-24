import { useEffect } from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { EMPTY_TUTOR_SESSION, type TutorSession } from '@/modules/tutor/store/tutorSlice';

/**
 * The selected chat's tutor session, loaded on first use. Every tutor surface
 * reads through this, so showing a chat's tutor UI is what loads its log.
 */
export function useTutorSession(): { chatId?: string; session: TutorSession } {
  const { chatId, session, ensure, enabled } = useChatStore(
    (s) => ({
      chatId: s.selectedChatId,
      session: s.selectedChatId ? s.tutorSessions[s.selectedChatId] : undefined,
      ensure: s.ensureTutorSession,
      enabled: !!s.ui.flags.experimentalTutor,
    }),
    shallow,
  );
  const loaded = !!session?.loaded;
  useEffect(() => {
    if (enabled && chatId && !loaded) void ensure(chatId).catch(() => undefined);
  }, [enabled, chatId, loaded, ensure]);
  return { chatId, session: session ?? EMPTY_TUTOR_SESSION };
}
