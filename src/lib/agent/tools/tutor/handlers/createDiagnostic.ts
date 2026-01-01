import { v4 as uuidv4 } from 'uuid';
import type { TutorDiagnostic, TutorDiagnosticItem } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { withContentReset } from '@/lib/agent/tools/tutor/shared';
import { parseSchema } from '@/lib/schemas/parse';
import { TutorDiagnosticToolSchema } from '@/lib/schemas/tutor';

type CreateDiagnosticArgs = {
  diagnostic: TutorDiagnostic;
};

export const createDiagnosticHandler: TutorToolHandler<CreateDiagnosticArgs> = {
  parseArgs(input) {
    const parsed = parseSchema(TutorDiagnosticToolSchema, input);
    if (!parsed.ok) return null;
    const args = parsed.data;
    const diagnosticId = args.diagnosticId?.trim() || `diag_${uuidv4()}`;
    const topic = args.topic?.trim();
    const depth =
      args.depth === 'moderate' || args.depth === 'comprehensive' ? args.depth : 'quick';
    const quiz = args.quiz;
    const normalizedItems = quiz.items
      .map((item, index: number) => {
        const question = item.question.trim();
        const choices = item.choices.map((choice) => choice.trim()).filter((choice) => choice);
        if (!question || choices.length < 2) return null;
        const id = item.id?.trim() || `diagnostic_item_${index + 1}_${uuidv4()}`;
        const correct = typeof item.correct === 'number' ? item.correct : undefined;
        const explanation = item.explanation?.trim();
        const skill = item.skill?.trim();
        const difficulty = item.difficulty as TutorDiagnosticItem['difficulty'] | undefined;
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
        : typeof quiz.adaptive === 'boolean'
          ? !!quiz.adaptive
          : false;
    const interpretation = quiz.interpretation;

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
