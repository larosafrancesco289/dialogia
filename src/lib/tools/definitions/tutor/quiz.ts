import { z } from 'zod';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { TutorMcqItemSchema } from '@/lib/schemas/tutor';

export const UnifiedQuizToolSchema = z.object({
  type: z.literal('mcq'),
  title: z.string().optional(),
  items: z.array(TutorMcqItemSchema).min(1).max(12),
  nodeId: z.string().optional().describe('Learning plan node this quiz assesses'),
});

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
      enum: ['mcq'],
      description: 'Quiz format (multiple choice).',
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
      description: 'Array of MCQ items: {question, choices, correct}.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Unique identifier for this quiz item.' },
          question: { type: 'string', description: 'The question text shown to the learner.' },
          choices: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 6,
            description: 'Answer options displayed to the learner.',
          },
          correct: {
            type: 'integer',
            minimum: 0,
            maximum: 5,
            description: '0-based index into the choices array indicating the correct answer.',
          },
          explanation: {
            type: 'string',
            description:
              'Brief explanation shown to the learner after they answer, clarifying why the correct answer is right.',
          },
          topic: { type: 'string', description: 'Topic this item assesses.' },
          skill: { type: 'string', description: 'Specific skill being tested.' },
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
    description: `Present a multiple-choice quiz to assess learner understanding. Use this during teaching for formative assessment or during practice for retrieval practice.

Choose MCQ when assessing: recognition, factual recall, concept discrimination.

Required arguments:
- type: "mcq"
- items: non-empty array of quiz items with {question, choices, correct}`,
    parameters: QUIZ_TOOL_PARAMETER_SCHEMA,
  },
};
