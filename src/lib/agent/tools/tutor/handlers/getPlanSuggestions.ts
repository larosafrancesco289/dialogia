import type { TutorPlanSuggestion } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizePlanSuggestions } from '@/lib/agent/tools/tutor/shared';
import { parseSchema } from '@/lib/schemas/parse';
import {
  TutorPlanSuggestionsToolSchema,
  type TutorPlanSuggestionsInput,
} from '@/lib/schemas/tutor';

export const getPlanSuggestionsHandler: TutorToolHandler<TutorPlanSuggestionsInput> = {
  parseArgs(input) {
    const parsed = parseSchema(TutorPlanSuggestionsToolSchema, input);
    if (!parsed.ok) return null;
    const normalized = normalizePlanSuggestions(parsed.data.suggestions as unknown[]);
    if (normalized.length === 0) return null;
    return { suggestions: normalized };
  },

  async apply(ctx, args) {
    await ctx.applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.planSuggestions)
        ? (prev.planSuggestions as TutorPlanSuggestion[])
        : [];
      const merged = [...prior, ...args.suggestions];
      return { planSuggestions: merged };
    });

    try {
      return {
        handled: true,
        usedContent: false,
        payload: JSON.stringify({
          suggestionCount: args.suggestions.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: false };
    }
  },
};
