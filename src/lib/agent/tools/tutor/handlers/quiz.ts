import type { MessageTutor } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizeTutorQuizPayload, withContentReset } from '@/lib/agent/tools/tutor/shared';
import { logger } from '@/lib/logger';

type QuizArgs = {
  items: Array<{ id: string; [key: string]: unknown }>;
  title?: string;
};

export function createQuizHandler(
  mapKey: keyof Pick<MessageTutor, 'mcq' | 'fillBlank' | 'openEnded' | 'flashcards'>,
): TutorToolHandler<QuizArgs> {
  return {
    parseArgs(input: unknown) {
      if (!input || typeof input !== 'object') return null;
      const record = input as Record<string, unknown>;
      const normalized = normalizeTutorQuizPayload(record);
      if (!normalized) return null;
      const title =
        typeof record.title === 'string' ? (record.title as string).trim() : undefined;
      return { items: normalized.items, title };
    },
    async apply(ctx, args) {
      const { items, title } = args;
      await ctx.applyTutorPatch((prev) =>
        withContentReset(mapKey, {
          [mapKey]: items,
          title:
            title ||
            (typeof prev.title === 'string' && prev.title.trim().length > 0 ? prev.title : undefined),
        }),
      );
      try {
        const payload: Record<string, unknown> = { items };
        if (title) payload.title = title;
        return { handled: true, usedContent: true, payload: JSON.stringify(payload) };
      } catch (error) {
        logger.error('Failed to serialize tutor items', error);
      }
      return { handled: true, usedContent: true };
    },
  };
}
