import type { StoreSetter } from '@/lib/agent/types';
import type { PlanTurnSideEffect } from '@/lib/agent/types';
import type { TurnStoreState } from '@/lib/agent/contracts';
import { updateMessageById } from '@/lib/messages/updateMessageById';

export function applyPlanSideEffects(opts: {
  sideEffects: PlanTurnSideEffect[];
  set: StoreSetter;
}): void {
  const { sideEffects, set } = opts;
  if (!sideEffects.length) return;

  for (const effect of sideEffects) {
    if (effect.type === 'append_planning_content') {
      const { chatId, messageId, content } = effect;
      if (!content?.trim()) continue;
      set((state: TurnStoreState) => {
        const result = updateMessageById(state, chatId, messageId, (msg) => {
          const existing = msg.content || '';
          const separator = existing.trim() ? '\n\n' : '';
          return { ...msg, content: existing + separator + content };
        });
        return result ?? {};
      });
    }
  }
}
