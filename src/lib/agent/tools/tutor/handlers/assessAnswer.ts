import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';

type AssessAnswerArgs = {
  nodeId: string;
  evidence: Record<string, unknown>;
};

export const assessAnswerHandler: TutorToolHandler<AssessAnswerArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const nodeId = typeof args.nodeId === 'string' ? args.nodeId.trim() : undefined;
    const interaction =
      args.interaction && typeof args.interaction === 'object'
        ? (args.interaction as Record<string, unknown>)
        : undefined;
    if (!nodeId || !interaction) {
      return null;
    }

    const evidence: Record<string, unknown> = {
      question: typeof interaction.question === 'string' ? interaction.question.trim() : '',
      studentAnswer:
        typeof interaction.studentAnswer === 'string' ? interaction.studentAnswer.trim() : '',
      correctAnswer:
        typeof interaction.correctAnswer === 'string'
          ? interaction.correctAnswer.trim()
          : undefined,
      questionType:
        typeof interaction.questionType === 'string' ? interaction.questionType : undefined,
      skill: typeof interaction.skill === 'string' ? interaction.skill.trim() : undefined,
      difficulty:
        typeof interaction.difficulty === 'string' ? interaction.difficulty.trim() : undefined,
      hintsUsed: typeof interaction.hintsUsed === 'number' ? interaction.hintsUsed : undefined,
      result:
        typeof interaction.correct === 'boolean'
          ? interaction.correct
            ? 'correct'
            : 'incorrect'
          : 'partial',
    };

    return { nodeId, evidence };
  },

  async apply(ctx, args) {
    await ctx.applyTutorPatch((prev) => {
      const prior = Array.isArray(prev.assessmentUpdates)
        ? (prev.assessmentUpdates as Record<string, unknown>[])
        : [];
      return {
        assessmentUpdates: [
          ...prior,
          {
            nodeId: args.nodeId,
            evidence: [args.evidence],
          },
        ],
      };
    });

    return { handled: true, usedContent: false };
  },
};
