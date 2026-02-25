import { z } from 'zod';
import type { ToolDefinition } from '@/lib/transport/contracts';
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
  items: z.array(TutorOpenEndedItemSchema).min(1).max(12),
  nodeId: z.string().optional().describe('Learning plan node this quiz assesses'),
});

export const UnifiedQuizToolSchema = z.discriminatedUnion('type', [
  QuizMcqSchema,
  QuizFillBlankSchema,
  QuizOpenEndedSchema,
]);

export type UnifiedQuizInput = z.infer<typeof UnifiedQuizToolSchema>;

// Keep quiz parameters as a plain object schema so providers that flatten unions
// still surface required fields to the model.
export const QUIZ_TOOL_PARAMETER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'items'],
  properties: {
    type: {
      type: 'string',
      enum: ['mcq', 'fill_blank', 'open_ended'],
      description: 'Quiz format.',
    },
    title: {
      type: 'string',
      description: 'Optional quiz title shown in the tutor panel.',
    },
    nodeId: {
      type: 'string',
      description: 'Learning plan node this quiz assesses.',
    },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      description:
        'For mcq use {question, choices, correct}. For fill_blank use {prompt, answer}. For open_ended use {prompt}.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          choices: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 6,
          },
          correct: { type: 'integer', minimum: 0, maximum: 5 },
          explanation: { type: 'string' },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          sample_answer: { type: 'string' },
          rubric: { type: 'string' },
          topic: { type: 'string' },
          skill: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        },
      },
    },
  },
};

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
- open_ended: Deeper understanding, synthesis, application

Required arguments:
- type: one of "mcq" | "fill_blank" | "open_ended"
- items: non-empty array of quiz items matching the selected type`,
    parameters: QUIZ_TOOL_PARAMETER_SCHEMA,
  },
};
