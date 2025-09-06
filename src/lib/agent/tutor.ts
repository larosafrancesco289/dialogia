// Tutor mode: system preamble and tool definitions
// The tools are presentation-only: the model generates the content and
// supplies it as arguments, which the UI renders as interactive widgets.

export function getTutorPreamble() {
  return (
    [
      'You are an expert, friendly tutor who uses evidence-based teaching practices.',
      '- Use Socratic questioning and brief, supportive feedback.',
      '- Prefer small steps, retrieval practice, and spaced repetition.',
      '- Calibrate difficulty to the learner’s level; offer hints before answers.',
      '- Encourage metacognition: ask learners to explain reasoning.',
      '',
      'Interactive tools are available for pedagogy. When appropriate, call a tool and do NOT include ordinary user-facing text in the same turn. After the tool returns, you will be prompted to continue the lesson in a follow-up turn.',
      '',
      'Tools you can call (supply fully-formed items in arguments):',
      '1) quiz_mcq: Present multiple-choice questions.',
      '   Schema: { title?: string, items: [{ question: string, choices: string[2..6], correct: integer(index), explanation?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Rules: concise questions, plausible distractors, 1 correct choice per item.',
      '2) quiz_fill_blank: Present fill-in-the-blank prompts.',
      '   Schema: { title?: string, items: [{ prompt: string, answer: string, aliases?: string[], explanation?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Rules: put a clear blank (e.g., "____") in prompt; provide succinct accepted answers.',
      '3) quiz_open_ended: Present short free-response prompts.',
      '   Schema: { title?: string, items: [{ prompt: string, sample_answer?: string, rubric?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Rules: keep prompts focused; include a compact sample or rubric when helpful.',
      '4) flashcards: Present spaced-repetition-friendly cards.',
      '   Schema: { title?: string, shuffle?: boolean, items: [{ front: string, back: string, hint?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Rules: atomic facts; avoid ambiguity; keep sides short.',
      '',
      'Fallback when tools unsupported: produce a brief lesson using bullet points and ask a targeted question. Keep messages concise.',
    ].join('\n')
  );
}

export function getTutorToolDefinitions() {
  return [
    {
      type: 'function',
      function: {
        name: 'quiz_mcq',
        description:
          'Render multiple-choice questions as interactive widgets. Provide fully-formed items.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  question: { type: 'string' },
                  choices: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 6,
                    items: { type: 'string' },
                  },
                  correct: { type: 'integer', minimum: 0, maximum: 5 },
                  explanation: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['question', 'choices', 'correct'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'quiz_fill_blank',
        description:
          'Render fill-in-the-blank prompts. Supply the accepted answer(s) to check correctness.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  prompt: { type: 'string' },
                  answer: { type: 'string' },
                  aliases: { type: 'array', items: { type: 'string' } },
                  explanation: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['prompt', 'answer'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'quiz_open_ended',
        description:
          'Render short free-response prompts with optional sample answers or rubrics.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 12,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  prompt: { type: 'string' },
                  sample_answer: { type: 'string' },
                  rubric: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['prompt'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'flashcards',
        description: 'Render flashcards for quick review (front/back).',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            shuffle: { type: 'boolean' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 40,
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  front: { type: 'string' },
                  back: { type: 'string' },
                  hint: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
                required: ['front', 'back'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
  ];
}
