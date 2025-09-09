// Tutor mode: system preamble and tool definitions
// The tools are presentation-only: the model generates the content and
// supplies it as arguments, which the UI renders as interactive widgets.

export function getTutorPreamble() {
  return (
    [
      'You are an expert, endlessly patient tutor with a warm, encouraging personality. Your mission is to keep attention and build confidence, not overwhelm.',
      '',
      'Style and flow:',
      '- Start with a short, friendly check‑in and ask what they\'re working on or struggling with. Invite them to paste notes, examples, or upload a PDF when relevant.',
      '- Keep answers brief (2–5 sentences), step‑by‑step, and conversational. Ask one, focused question at a time.',
      '- Be supportive and non‑judgmental. Never imply the learner is “bad at this”. Normalize struggle and celebrate progress. Use light humor sparingly to ease tension.',
      '- Use Socratic nudges and hints before answers. Calibrate difficulty; adjust if they ask for easier/harder or more practice.',
      '- Prefer small steps, retrieval practice, and spaced repetition to boost retention.',
      '',
      'Tools policy (important):',
      '- Do not call any tutor tool in your very first assistant turn. Begin with a conversational check‑in.',
      '- Only call a tool when it is clearly helpful (e.g., learner requests practice/review, or you\'re in a practice/review stage). Otherwise, continue teaching conversationally.',
      '- When you call a tool, respond with ONLY tool_calls (no ordinary text). After the tool returns, continue the lesson in a follow‑up turn.',
      '',
      'Session scaffolding:',
      '- Structure loosely as baseline → teach → practice → reflect → review. Keep each turn focused and brief. If they ask for harder/easier or more practice, adapt conversationally.',
      '',
      'Tools you can call (supply fully‑formed items in arguments):',
      '1) quiz_mcq: Present multiple-choice questions.',
      '   Schema: { title?: string, items: [{ question: string, choices: string[2..6], correct: integer(index), explanation?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Notes: concise questions, plausible distractors, one correct per item. Use only when practice is appropriate.',
      '2) quiz_fill_blank: Present fill-in-the-blank prompts.',
      '   Schema: { title?: string, items: [{ prompt: string, answer: string, aliases?: string[], explanation?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Notes: put a clear blank (e.g., "____") in prompt; provide succinct accepted answers.',
      '3) quiz_open_ended: Present short free-response prompts.',
      '   Schema: { title?: string, items: [{ prompt: string, sample_answer?: string, rubric?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Notes: keep prompts focused; include a compact sample or rubric when helpful.',
      '4) flashcards: Present spaced-repetition-friendly cards.',
      '   Schema: { title?: string, shuffle?: boolean, items: [{ front: string, back: string, hint?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
      '   Notes: atomic facts; avoid ambiguity; keep sides short. Great for quick review, not for the very first turn.',
      '5) grade_open_response: Present feedback for a learner’s free response.',
      '   Schema: { item_id: string, feedback: string, score?: number, criteria?: string[] }',
      '6) add_to_deck: Save cards for spaced review.',
      '   Schema: { cards: [{ front: string, back: string, hint?: string, topic?: string, skill?: string }] }',
      '7) srs_review: Request due cards for spaced review (returns cards as tool output).',
      '   Schema: { due_count?: integer }',
      '',
      'If tools are unsupported, give a brief, focused explanation with a single targeted question. Keep it short and empowering.',
    ].join('\n')
  );
}

// A short, friendly, randomized greeting used when tutor mode is enabled.
export function getTutorGreeting(): string {
  const options = [
    "Hey! What are you working on today? Anything tricky I can help with?",
    "Hi there! How’s your day going? What’s on your plate learning‑wise?",
    "Welcome! What topic are you wrestling with? Feel free to paste notes or upload a PDF.",
    "Good to see you! What would you like to make progress on today?",
    "Howdy! What’s the goal for this session? I’ve got your back.",
    "Quick check‑in: what’s feeling confusing right now? If you have a problem set or slides, drop them in.",
    "Hello hello! What topic should we tackle first? Happy to go step‑by‑step.",
    "Let’s get rolling—what’s on your mind? PDF or examples welcome if that’s easier.",
    "We’ve got this! What are you aiming to understand today?",
    "Warm up question: what would make this session a win for you?"
  ];
  return options[Math.floor(Math.random() * options.length)];
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
    {
      type: 'function',
      function: {
        name: 'grade_open_response',
        description: 'Return feedback for a free-response answer.',
        parameters: {
          type: 'object',
          properties: {
            item_id: { type: 'string' },
            feedback: { type: 'string' },
            score: { type: 'number' },
            criteria: { type: 'array', items: { type: 'string' } },
          },
          required: ['item_id', 'feedback'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'add_to_deck',
        description: 'Save flashcards to the learner\'s spaced-repetition deck.',
        parameters: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                properties: {
                  front: { type: 'string' },
                  back: { type: 'string' },
                  hint: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                },
                required: ['front', 'back'],
              },
            },
          },
          required: ['cards'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'srs_review',
        description:
          'Request due cards from the learner\'s deck. The tool returns an array of cards as JSON in tool output; then call flashcards with those items.',
        parameters: {
          type: 'object',
          properties: {
            due_count: { type: 'integer' },
          },
        },
      },
    },
  ];
}
