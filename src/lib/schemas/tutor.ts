import { z } from 'zod';
import { LearningPlanInputSchema } from '@/lib/schemas/learningPlan';

const difficultySchema = z.enum(['easy', 'medium', 'hard']);

export const TutorPlanSuggestionSchema = z.object({
  action: z.string(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  description: z.string().optional(),
  rationale: z.string().optional(),
  estimatedImpact: z.string().optional(),
  implementationDetails: z.record(z.unknown()).optional(),
});

export const TutorPlanProposalToolSchema = z.object({
  plan: LearningPlanInputSchema,
  requiresConfirmation: z.boolean().optional(),
  confirmationMessage: z.string().optional(),
  suggestions: z.array(TutorPlanSuggestionSchema).optional(),
});

export const TutorPlanSuggestionsToolSchema = z.object({
  suggestions: z.array(TutorPlanSuggestionSchema).min(1).max(6),
});

export const TutorMcqItemSchema = z
  .object({
    id: z.string().optional(),
    question: z.string(),
    choices: z.array(z.string()).min(2).max(6),
    correct: z.number().int().min(0).max(5),
    explanation: z.string().optional(),
    topic: z.string().optional(),
    skill: z.string().optional(),
    difficulty: difficultySchema.optional(),
  })
  .superRefine((item, ctx) => {
    if (item.correct >= item.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correct_out_of_range',
        path: ['correct'],
      });
    }
  });

export const TutorQuizMcqToolSchema = z.object({
  title: z.string().optional(),
  items: z.array(TutorMcqItemSchema).min(1).max(12),
});

export const TutorDiagnosticItemSchema = z
  .object({
    id: z.string().optional(),
    question: z.string(),
    choices: z.array(z.string()).min(2).max(6),
    correct: z.number().int().min(0).max(5).optional(),
    explanation: z.string().optional(),
    skill: z.string().optional(),
    difficulty: z
      .enum(['beginner', 'intermediate', 'advanced', 'mixed', 'easy', 'medium', 'hard'])
      .optional(),
  })
  .superRefine((item, ctx) => {
    if (typeof item.correct === 'number' && item.correct >= item.choices.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correct_out_of_range',
        path: ['correct'],
      });
    }
  });

export const TutorDiagnosticQuizSchema = z.object({
  type: z.enum(['mcq', 'mixed']).optional(),
  items: z.array(TutorDiagnosticItemSchema).min(3).max(20),
  interpretation: z.record(z.string()).optional(),
  adaptive: z.boolean().optional(),
});

export const TutorDiagnosticToolSchema = z.object({
  diagnosticId: z.string().optional(),
  topic: z.string().optional(),
  depth: z.enum(['quick', 'moderate', 'comprehensive']).optional(),
  adaptToAnswers: z.boolean().optional(),
  quiz: TutorDiagnosticQuizSchema,
});

export type TutorPlanProposalInput = z.infer<typeof TutorPlanProposalToolSchema>;
export type TutorPlanSuggestionsInput = z.infer<typeof TutorPlanSuggestionsToolSchema>;
export type TutorQuizMcqInput = z.infer<typeof TutorQuizMcqToolSchema>;
export type TutorDiagnosticInput = z.infer<typeof TutorDiagnosticToolSchema>;
