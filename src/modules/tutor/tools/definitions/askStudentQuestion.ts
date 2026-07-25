import type { ToolDefinition } from '@/lib/transport/contracts';

export const askStudentQuestionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ask_student_question',
    description:
      'Deliver a targeted intake questionnaire that gathers goals, constraints, and preferences before you plan or diagnose. Use it when you need structured answers instead of inferring from chat context, especially at the start of a session or after the learner’s circumstances change. Frame the questions as the basis for diagnostics, plan scope, and tutoring strategy so the learner understands why you are asking.',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Optional heading shown above the questionnaire',
        },
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 4,
          description: '1-4 targeted questions for the learner',
          items: {
            type: 'object',
            required: ['question', 'options'],
            properties: {
              id: { type: 'string', description: 'Stable identifier for this question' },
              question: { type: 'string', description: 'Question text presented to learner' },
              category: { type: 'string', description: 'Short label or grouping (e.g., Goal)' },
              allowMultiple: {
                type: 'boolean',
                description: 'Allow selection of multiple options (default: false)',
              },
              followUpBehavior: {
                type: 'string',
                enum: ['required', 'optional', 'none'],
                description: 'Should tutor ask a textual follow-up based on selection?',
              },
              options: {
                type: 'array',
                minItems: 2,
                maxItems: 6,
                items: {
                  type: 'object',
                  required: ['label'],
                  properties: {
                    label: {
                      type: 'string',
                      description: 'Concise option label (1-5 words)',
                    },
                    description: {
                      type: 'string',
                      description: 'Optional clarification/implications for the learner',
                    },
                  },
                },
              },
            },
          },
        },
      },
      required: ['questions'],
    },
  },
};
