import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizePlanSuggestions, withContentReset } from '@/lib/agent/tools/tutor/shared';
import { validateLearningPlan } from '@/lib/learning-plan/validate';
import { normalizeLearningPlanInput } from '@/lib/schemas/learningPlan';
import { parseSchema } from '@/lib/schemas/parse';
import { TutorPlanProposalToolSchema, type TutorPlanProposalInput } from '@/lib/schemas/tutor';

export const learningPlanHandler: TutorToolHandler<TutorPlanProposalInput> = {
  parseArgs(input) {
    const parsed = parseSchema(TutorPlanProposalToolSchema, input);
    return parsed.ok ? parsed.data : null;
  },
  async apply(ctx, args) {
    const existingPlan = ctx.chat.settings.features.tutor.learningPlan;
    const isCreate = !existingPlan;

    const plan = normalizeLearningPlanInput(args.plan, {
      fallbackGoal: existingPlan?.goal || 'Personalized Learning Plan',
    });

    if (plan.nodes.length === 0) {
      return { handled: false, usedContent: false };
    }

    const validation = validateLearningPlan(plan);
    if (!validation.valid) {
      return { handled: false, usedContent: false };
    }

    // For create, default to requiring confirmation; for update, default to not requiring
    const requiresConfirmation =
      typeof args.requiresConfirmation === 'boolean' ? args.requiresConfirmation : isCreate;
    const confirmationMessage =
      typeof args.confirmationMessage === 'string' ? args.confirmationMessage.trim() : undefined;

    const normalizedSuggestions = Array.isArray(args.suggestions)
      ? normalizePlanSuggestions(args.suggestions as unknown[])
      : undefined;

    await ctx.applyTutorPatch((prev) =>
      withContentReset('planProposal', {
        planProposal: {
          plan,
          requiresConfirmation,
          confirmationMessage,
          status: 'pending' as const,
          requestedAt: Date.now(),
        },
        planSuggestions:
          normalizedSuggestions && normalizedSuggestions.length > 0
            ? normalizedSuggestions
            : Array.isArray(prev.planSuggestions)
              ? prev.planSuggestions
              : undefined,
      }),
    );

    return {
      handled: true,
      usedContent: true,
      payload: JSON.stringify({
        status: 'plan_ready',
        action: isCreate ? 'created' : 'updated',
        requiresConfirmation,
        nodes: plan.nodes.length,
      }),
    };
  },
};
