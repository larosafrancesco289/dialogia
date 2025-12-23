import type { MessageTutor } from '@/lib/types';
import type { UIState } from '@/lib/store/types';

export const selectTutorEntry = (ui: UIState, messageId: string) =>
  ui.tutor.byMessageId?.[messageId];

export const mergeTutorMap = (
  ui: UIState,
  incoming: Record<string, MessageTutor>,
): UIState => {
  if (!incoming || Object.keys(incoming).length === 0) return ui;
  return {
    ...ui,
    tutor: {
      ...ui.tutor,
      byMessageId: { ...(ui.tutor.byMessageId || {}), ...incoming },
    },
  };
};

export const upsertTutorEntry = (
  ui: UIState,
  messageId: string,
  entry: MessageTutor,
): UIState => {
  if (!messageId) return ui;
  return mergeTutorMap(ui, { [messageId]: entry });
};
