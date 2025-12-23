import { v4 as uuidv4 } from 'uuid';
import type { TutorDiagnostic, TutorDiagnosticItem } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { DIAGNOSTIC_DIFFICULTIES, withContentReset } from '@/lib/agent/tools/tutor/shared';

type CreateDiagnosticArgs = {
  diagnostic: TutorDiagnostic;
};

export const createDiagnosticHandler: TutorToolHandler<CreateDiagnosticArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const diagnosticId =
      typeof args.diagnosticId === 'string' && args.diagnosticId.trim()
        ? args.diagnosticId.trim()
        : `diag_${uuidv4()}`;
    const topic = typeof args.topic === 'string' ? args.topic.trim() : undefined;
    const depthRaw = typeof args.depth === 'string' ? args.depth.trim() : undefined;
    const depth: 'quick' | 'moderate' | 'comprehensive' =
      depthRaw === 'moderate' || depthRaw === 'comprehensive' ? depthRaw : 'quick';
    const quiz = args.quiz && typeof args.quiz === 'object' ? (args.quiz as any) : {};
    const itemsRaw = Array.isArray(quiz?.items) ? quiz.items : [];
    const normalizedItems = itemsRaw
      .map((item: any, index: number) => {
        if (!item || typeof item !== 'object') return null;
        const question = typeof item.question === 'string' ? item.question.trim() : undefined;
        const choicesRaw = Array.isArray(item.choices) ? item.choices : [];
        const choices = choicesRaw
          .map((choice: unknown) => (typeof choice === 'string' ? choice.trim() : undefined))
          .filter(
            (choice: unknown): choice is string =>
              typeof choice === 'string' && choice.trim().length > 0,
          );
        if (!question || choices.length < 2) return null;
        const id =
          typeof item.id === 'string' && item.id.trim()
            ? item.id.trim()
            : `diagnostic_item_${index + 1}_${uuidv4()}`;
        const correct =
          typeof item.correct === 'number' && Number.isFinite(item.correct)
            ? item.correct
            : undefined;
        const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : undefined;
        const skill = typeof item.skill === 'string' ? item.skill.trim() : undefined;
        const rawDifficulty =
          typeof item.difficulty === 'string' ? item.difficulty.trim() : undefined;
        const difficulty =
          rawDifficulty && DIAGNOSTIC_DIFFICULTIES.has(rawDifficulty as TutorDiagnosticItem['difficulty'])
            ? (rawDifficulty as TutorDiagnosticItem['difficulty'])
            : undefined;
        return {
          id,
          question,
          choices,
          correct,
          explanation,
          skill,
          difficulty,
        };
      })
      .filter(Boolean) as TutorDiagnosticItem[];

    if (normalizedItems.length === 0) {
      return null;
    }

    const adaptToAnswers =
      typeof args.adaptToAnswers === 'boolean'
        ? args.adaptToAnswers
        : typeof quiz?.adaptive === 'boolean'
          ? !!quiz.adaptive
          : false;
    const interpretation =
      quiz?.interpretation && typeof quiz.interpretation === 'object'
        ? (quiz.interpretation as Record<string, string>)
        : undefined;

    const diagnostic: TutorDiagnostic = {
      diagnosticId,
      topic: topic || '',
      depth,
      items: normalizedItems,
      adaptToAnswers,
      interpretation,
      status: 'pending',
    };

    return { diagnostic };
  },

  async apply(ctx, args) {
    const { diagnostic } = args;
    await ctx.applyTutorPatch(() => withContentReset('diagnostic', { diagnostic }));
    try {
      return {
        handled: true,
        usedContent: true,
        payload: JSON.stringify({
          diagnosticId: diagnostic.diagnosticId,
          itemCount: diagnostic.items.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: true };
    }
  },
};
