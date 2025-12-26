import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { getDueCards } from '@/lib/tutorDeck';
import { logger } from '@/lib/logger';

type SrsReviewArgs = {
  dueCount: number;
};

export const srsReviewHandler: TutorToolHandler<SrsReviewArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const dueCount = Math.min(
      Math.max(Number.parseInt(String(args.due_count ?? '10'), 10) || 10, 1),
      40,
    );
    return { dueCount };
  },

  async apply(ctx, args) {
    let due: Record<string, unknown>[] = [];
    try {
      const cards = await getDueCards(ctx.chat.id, args.dueCount);
      due = cards.map((c) => ({
        id: c.id,
        front: c.front,
        back: c.back,
        hint: c.hint,
        topic: c.topic,
        skill: c.skill,
      }));
    } catch (error) {
      logger.error('Failed to fetch due cards', error);
    }
    return { handled: true, usedContent: false, payload: JSON.stringify(due) };
  },
};
