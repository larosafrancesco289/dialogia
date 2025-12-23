import type { TutorPlanSuggestion } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizePlanSuggestions } from '@/lib/agent/tools/tutor/shared';

type PlanSuggestionsArgs = {
  suggestions: TutorPlanSuggestion[];
};

export const getPlanSuggestionsHandler: TutorToolHandler<PlanSuggestionsArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const suggestionsRaw = Array.isArray(args.suggestions) ? (args.suggestions as unknown[]) : [];
    const normalized = normalizePlanSuggestions(suggestionsRaw);
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
