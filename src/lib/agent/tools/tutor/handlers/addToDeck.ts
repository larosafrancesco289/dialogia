import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { addCardsToDeck } from '@/lib/tutor/deck';
import { logger } from '@/lib/logger';

type AddToDeckCard = Parameters<typeof addCardsToDeck>[1][number];

type AddToDeckArgs = {
  cards: AddToDeckCard[];
};

const isCardInput = (value: unknown): value is AddToDeckCard => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.front === 'string' && typeof record.back === 'string';
};

export const addToDeckHandler: TutorToolHandler<AddToDeckArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const cards = Array.isArray(args.cards) ? args.cards.filter(isCardInput) : [];
    return { cards };
  },

  async apply(ctx, args) {
    try {
      if (args.cards.length > 0) await addCardsToDeck(ctx.chat.id, args.cards);
    } catch (error) {
      logger.error('Failed to add cards to deck', error);
    }
    return { handled: true, usedContent: false };
  },
};
