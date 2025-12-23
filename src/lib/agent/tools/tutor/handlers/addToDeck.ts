import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { addCardsToDeck } from '@/lib/tutorDeck';

type AddToDeckArgs = {
  cards: any[];
};

export const addToDeckHandler: TutorToolHandler<AddToDeckArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const cards = Array.isArray(args.cards) ? (args.cards as any[]) : [];
    return { cards };
  },

  async apply(ctx, args) {
    try {
      if (args.cards.length > 0) await addCardsToDeck(ctx.chat.id, args.cards);
    } catch (error) {
      console.error('Failed to add cards to deck', error);
    }
    return { handled: true, usedContent: false };
  },
};
