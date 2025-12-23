import { v4 as uuidv4 } from 'uuid';
import type { LearningPlan } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizePlanSuggestions, withContentReset } from '@/lib/agent/tools/tutor/shared';
import { validateLearningPlan } from '@/lib/learningPlan/validate';

export function createPlanProposalHandler(
  defaultRequiresConfirmation: boolean,
): TutorToolHandler<Record<string, unknown>> {
  return {
    parseArgs(input) {
      if (!input || typeof input !== 'object') return null;
      return input as Record<string, unknown>;
    },
    async apply(ctx, args) {
      const source =
        args.plan && typeof args.plan === 'object' ? (args.plan as Record<string, unknown>) : args;
      const nodesRaw = Array.isArray(source.nodes) ? source.nodes : [];
      const normalizedNodes = nodesRaw
        .map((node: any, index: number) => {
          if (!node || typeof node !== 'object') return null;
          const nameRaw = typeof node.name === 'string' ? node.name.trim() : undefined;
          const objectivesRaw = Array.isArray(node.objectives)
            ? (node.objectives as unknown[])
            : [];
          const objectives = objectivesRaw
            .map((obj: unknown) => (typeof obj === 'string' ? obj.trim() : undefined))
            .filter((obj): obj is string => !!obj);
          const prerequisitesRaw = Array.isArray(node.prerequisites)
            ? (node.prerequisites as unknown[])
            : [];
          const prerequisites = prerequisitesRaw
            .map((pr: unknown) => (typeof pr === 'string' ? pr.trim() : undefined))
            .filter((pr): pr is string => !!pr);
          if (!nameRaw || objectives.length === 0) return null;
          const id =
            typeof node.id === 'string' && node.id.trim()
              ? node.id.trim()
              : `node_${index + 1}_${uuidv4()}`;
          return {
            id,
            name: nameRaw,
            description: typeof node.description === 'string' ? node.description.trim() : undefined,
            objectives,
            prerequisites,
            status:
              node.status === 'in_progress' || node.status === 'completed'
                ? node.status
                : 'not_started',
            estimatedMinutes:
              typeof node.estimatedMinutes === 'number'
                ? Math.max(5, Math.min(360, Math.round(node.estimatedMinutes)))
                : undefined,
            resources: Array.isArray(node.resources) ? node.resources : undefined,
            children: Array.isArray(node.children) ? node.children : undefined,
          };
        })
        .filter(Boolean) as LearningPlan['nodes'];

      if (normalizedNodes.length === 0) {
        return { handled: false, usedContent: false };
      }

      const plan: LearningPlan = {
        goal:
          typeof source.goal === 'string' && source.goal.trim()
            ? (source.goal as string).trim()
            : ctx.chat.settings.learningPlan?.goal || 'Personalized Learning Plan',
        generatedAt: Date.now(),
        updatedAt: Date.now(),
        version: 1,
        nodes: normalizedNodes,
        metadata:
          source.metadata && typeof source.metadata === 'object'
            ? (source.metadata as Record<string, unknown>)
            : undefined,
      };

      const validation = validateLearningPlan(plan);
      if (!validation.valid) {
        return { handled: false, usedContent: false };
      }

      const requiresConfirmation =
        typeof source.requiresConfirmation === 'boolean'
          ? (source.requiresConfirmation as boolean)
          : defaultRequiresConfirmation;
      const confirmationMessage =
        typeof source.confirmationMessage === 'string'
          ? source.confirmationMessage.trim()
          : undefined;

      const normalizedSuggestions = Array.isArray(source.suggestions)
        ? normalizePlanSuggestions(source.suggestions as unknown[])
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

      try {
        return {
          handled: true,
          usedContent: true,
          payload: JSON.stringify({
            status: 'plan_ready',
            requiresConfirmation,
            nodes: plan.nodes.length,
          }),
        };
      } catch {
        return { handled: true, usedContent: true };
      }
    },
  };
}
