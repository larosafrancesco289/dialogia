import { z } from 'zod';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import {
  TutorMcqItemSchema,
  TutorFillBlankItemSchema,
  TutorOpenEndedItemSchema,
} from '@/lib/schemas/tutor';

const QuizMcqSchema = z.object({
  type: z.literal('mcq'),
  title: z.string().optional(),
  items: z.array(TutorMcqItemSchema).min(1).max(12),
  nodeId: z.string().optional().describe('Learning plan node this quiz assesses'),
});

const QuizFillBlankSchema = z.object({
  type: z.literal('fill_blank'),
  title: z.string().optional(),
  items: z.array(TutorFillBlankItemSchema).min(1).max(12),
  nodeId: z.string().optional().describe('Learning plan node this quiz assesses'),
});

const QuizOpenEndedSchema = z.object({
  type: z.literal('open_ended'),
  title: z.string().optional(),
  items: z.array(TutorOpenEndedItemSchema).min(1).max(8),
  nodeId: z.string().optional().describe('Learning plan node this quiz assesses'),
});

export const UnifiedQuizToolSchema = z.discriminatedUnion('type', [
  QuizMcqSchema,
  QuizFillBlankSchema,
  QuizOpenEndedSchema,
]);

export type UnifiedQuizInput = z.infer<typeof UnifiedQuizToolSchema>;

export const quizTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'quiz',
    description: `Present a quiz to assess learner understanding. Use this during teaching for formative assessment or during practice for retrieval practice.

Supports three question types:
- 'mcq': Multiple choice with options array
- 'fill_blank': Sentence with blank to fill
- 'open_ended': Free response with rubric for grading

Choose the type based on what you're assessing:
- mcq: Recognition, factual recall, concept discrimination
- fill_blank: Recall of specific terms, definitions, formulas
- open_ended: Deeper understanding, synthesis, application`,
    parameters: toJsonSchema(UnifiedQuizToolSchema),
  },
};
