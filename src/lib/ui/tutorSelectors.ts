import type { UIState } from '@/lib/store/types';

export const selectTutorEntry = (ui: UIState, messageId: string) =>
  ui.tutorByMessageId?.[messageId];

export const mergeTutorMap = (ui: UIState, incoming: Record<string, any>): UIState => {
  if (!incoming || Object.keys(incoming).length === 0) return ui;
  return {
    ...ui,
    tutorByMessageId: { ...(ui.tutorByMessageId || {}), ...incoming },
  };
};

export const upsertTutorEntry = (ui: UIState, messageId: string, entry: any): UIState => {
  if (!messageId) return ui;
  return mergeTutorMap(ui, { [messageId]: entry });
};
