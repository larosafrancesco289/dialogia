import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';

type GradeOpenResponseArgs = {
  itemId: string;
  feedback: string;
  score?: number;
  criteria?: string[];
};

export const gradeOpenResponseHandler: TutorToolHandler<GradeOpenResponseArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const rawId = typeof args.item_id === 'string' ? args.item_id.trim() : '';
    if (!rawId || rawId === 'null' || rawId === 'undefined') return null;
    const feedback = typeof args.feedback === 'string' ? args.feedback.trim() : '';
    if (!feedback) return null;
    const score = typeof args.score === 'number' ? (args.score as number) : undefined;
    const criteriaRaw = Array.isArray(args.criteria) ? (args.criteria as unknown[]) : undefined;
    const criteria = criteriaRaw
      ?.map((entry) => (typeof entry === 'string' ? entry.trim() : undefined))
      .filter((value): value is string => typeof value === 'string' && value.length > 0);
    return { itemId: rawId, feedback, score, criteria };
  },

  async apply(ctx, args) {
    await ctx.applyTutorPatch((prev) => {
      const existingGrading =
        (prev.grading as Record<string, { score?: number; feedback: string; criteria?: string[] }>) ||
        {};
      return {
        grading: {
          ...existingGrading,
          [args.itemId]: { feedback: args.feedback, score: args.score, criteria: args.criteria },
        },
      };
    });
    return { handled: true, usedContent: false };
  },
};
