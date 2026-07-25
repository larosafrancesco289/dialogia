// Module: ui/tutorState
// Responsibility: Plumbing over the optional `UiSnapshot.tutor` state that core
// declares. No tutor behaviour lives here — only reads and merges of a core field,
// which is why it stays on the core side of the module boundary.

import type { MessageTutor } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';

export const selectTutorEntry = (ui: UiSnapshot, messageId: string) =>
  ui.tutor?.byMessageId?.[messageId];

export const mergeTutorMap = <T extends UiSnapshot>(
  ui: T,
  incoming: Record<string, MessageTutor>,
): T => {
  if (!incoming || Object.keys(incoming).length === 0) return ui;
  return {
    ...ui,
    tutor: {
      ...ui.tutor,
      byMessageId: { ...(ui.tutor?.byMessageId || {}), ...incoming },
    },
  } as T;
};

export const upsertTutorEntry = <T extends UiSnapshot>(
  ui: T,
  messageId: string,
  entry: MessageTutor,
): T => {
  if (!messageId) return ui;
  return mergeTutorMap(ui, { [messageId]: entry });
};
