import { v4 as uuidv4 } from 'uuid';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { withContentReset } from '@/lib/agent/tools/tutor/shared';

type QuestionOption = {
  label: string;
  description?: string;
};

type NormalizedQuestion = {
  id: string;
  question: string;
  category?: string;
  allowMultiple?: boolean;
  followUpBehavior: 'required' | 'optional' | 'none';
  options: QuestionOption[];
};

type AskStudentQuestionArgs = {
  questions: NormalizedQuestion[];
  title?: string;
};

export const askStudentQuestionHandler: TutorToolHandler<AskStudentQuestionArgs> = {
  parseArgs(input) {
    if (!input || typeof input !== 'object') return null;
    const args = input as Record<string, unknown>;
    const rawQuestions = Array.isArray(args.questions) ? (args.questions as unknown[]) : [];
    const normalizedQuestions = rawQuestions
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') return null;
        const record = entry as Record<string, unknown>;
        const questionText =
          typeof record.question === 'string' ? record.question.trim() : undefined;
        if (!questionText) return null;
        const optionsRaw = Array.isArray(record.options) ? (record.options as unknown[]) : [];
        const options = optionsRaw
          .map((opt) => {
            if (!opt || typeof opt !== 'object') return null;
            const optRecord = opt as Record<string, unknown>;
            const label =
              typeof optRecord.label === 'string'
                ? optRecord.label.trim()
                : typeof optRecord.title === 'string'
                  ? optRecord.title.trim()
                  : '';
            if (!label) return null;
            const description =
              typeof optRecord.description === 'string' ? optRecord.description.trim() : undefined;
            return { label, description };
          })
          .filter(Boolean) as QuestionOption[];
        if (options.length < 2) return null;
        const allowMultiple =
          typeof record.allowMultiple === 'boolean'
            ? record.allowMultiple
            : typeof record.multiSelect === 'boolean'
              ? record.multiSelect
              : false;
        const followUpBehavior =
          typeof record.followUpBehavior === 'string' ? record.followUpBehavior : undefined;
        const category =
          typeof record.category === 'string'
            ? record.category.trim()
            : typeof record.header === 'string'
              ? record.header.trim()
              : undefined;
        const idRaw =
          typeof record.id === 'string' ? record.id.trim() : `question_${index + 1}_${uuidv4()}`;
        return {
          id: idRaw,
          question: questionText,
          category,
          allowMultiple,
          followUpBehavior:
            followUpBehavior === 'required' || followUpBehavior === 'optional'
              ? followUpBehavior
              : 'none',
          options,
        };
      })
      .filter(Boolean) as NormalizedQuestion[];

    if (normalizedQuestions.length === 0) {
      return null;
    }

    const title =
      typeof args.title === 'string'
        ? args.title.trim()
        : typeof args.prompt === 'string'
          ? args.prompt.trim()
          : undefined;

    return { questions: normalizedQuestions, title };
  },

  async apply(ctx, args) {
    await ctx.applyTutorPatch((prev) =>
      withContentReset('questionnaire', {
        questionnaire: {
          questions: args.questions,
          status: 'awaiting' as const,
          submittedAt: undefined,
          responses: undefined,
        },
        title: args.title || (typeof prev.title === 'string' ? prev.title : undefined),
      }),
    );

    try {
      return {
        handled: true,
        usedContent: true,
        payload: JSON.stringify({
          status: 'awaiting_student',
          questionCount: args.questions.length,
        }),
      };
    } catch {
      return { handled: true, usedContent: true };
    }
  },
};
