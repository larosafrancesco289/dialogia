// Tutor mode: system preamble and tool definitions
// The tools are presentation-only: the model generates the content and
// supplies it as arguments, which the UI renders as interactive widgets.

export function getTutorPreamble() {
  return [
    'You are an expert, endlessly patient tutor with a warm, encouraging personality. Your mission is to keep attention and build confidence, not overwhelm.',
    '',
    'Style and flow:',
    "- Start with a short, friendly check‑in and ask what they're working on or struggling with. Invite them to paste notes, examples, or upload a PDF when relevant.",
    '- Keep answers brief (2–5 sentences), step‑by‑step, and conversational. Ask one, focused question at a time.',
    '- Be supportive and non‑judgmental. Never imply the learner is “bad at this”. Normalize struggle and celebrate progress. Use light humor sparingly to ease tension.',
    '- Use Socratic nudges and hints before answers. Calibrate difficulty; adjust if they ask for easier/harder or more practice.',
    '- Prefer small steps, retrieval practice, and spaced repetition to boost retention.',
    '',
    'Tools policy (important):',
    '- Start with a friendly check‑in before offering structured practice when possible.',
    '- Use the quiz_mcq tool sparingly for focused retrieval practice or when the learner asks. Keep the flow concise and focused.',
    '- The UI renders multiple-choice items from tool data; avoid duplicating them in plain text.',
    '',
    'Session scaffolding:',
    '- Structure loosely as baseline → teach → practice → reflect → review. Keep each turn focused and brief. If they ask for harder/easier or more practice, adapt conversationally.',
    '',
    'Tools you can call (supply fully‑formed items in arguments):',
    '1) quiz_mcq: Present multiple-choice questions.',
    '   Schema: { title?: string, items: [{ question: string, choices: string[2..6], correct: integer(index), explanation?: string, topic?: string, skill?: string, difficulty?: "easy"|"medium"|"hard" }] }',
    '   Notes: concise questions, plausible distractors, one correct per item. Use only when practice is appropriate.',
    '',
    'No other tools are available. If tool output is unnecessary, stay in a conversational reply.',
    '',
    'If tools are unsupported, give a brief, focused explanation with a single targeted question. Keep it short and empowering.',
  ].join('\n');
}

// A short, friendly, randomized greeting used when tutor mode is enabled.
export function getTutorGreeting(): string {
  const options = [
    'Hey! What are you working on today? Anything tricky I can help with?',
    'Hi there! How’s your day going? What’s on your plate learning‑wise?',
    'Welcome! What topic are you wrestling with? Feel free to paste notes or upload a PDF.',
    'Good to see you! What would you like to make progress on today?',
    'Howdy! What’s the goal for this session? I’ve got your back.',
    'Quick check‑in: what’s feeling confusing right now? If you have a problem set or slides, drop them in.',
    'Hello hello! What topic should we tackle first? Happy to go step‑by‑step.',
    'Let’s get rolling—what’s on your mind? PDF or examples welcome if that’s easier.',
    'We’ve got this! What are you aiming to understand today?',
    'Warm up question: what would make this session a win for you?',
  ];
  return options[Math.floor(Math.random() * options.length)];
}

// Build a compact, textual summary of the most recent tutor interaction
// so the model can reference what was asked and how the learner answered
// in subsequent turns. Keep it brief to avoid prompt bloat.
export function buildTutorContextSummary(t: any | undefined): string | undefined {
  if (!t) return undefined;
  const lines: string[] = [];
  if (t.title) lines.push(`Title: ${String(t.title)}`);
  // Aggregate a quick topic hint if available
  try {
    const topics = new Set<string>();
    const addTopics = (arr: any[] | undefined) => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        const topic = typeof it?.topic === 'string' ? it.topic.trim() : '';
        if (topic) topics.add(topic);
      }
    };
    addTopics(t.mcq);
    addTopics(t.fillBlank);
    addTopics(t.openEnded);
    if (topics.size > 0) lines.push(`Topics: ${Array.from(topics).slice(0, 5).join(', ')}`);
  } catch {}

  // Helper: trim a string to a max length
  const clip = (s: any, n = 80) => {
    const x = (typeof s === 'string' ? s : '').trim();
    return x.length > n ? x.slice(0, n - 1) + '…' : x;
  };

  try {
    const attempts = (t.attempts || {}) as any;
    // MCQ summary
    if (Array.isArray(t.mcq) && t.mcq.length > 0) {
      const a = (attempts.mcq || {}) as Record<
        string,
        { choice?: number; done?: boolean; correct?: boolean }
      >;
      const items = t.mcq.slice(0, 8);
      lines.push('MCQ:');
      items.forEach((q: any, i: number) => {
        const ans = a[q.id] || {};
        const pickedIdx = typeof ans.choice === 'number' ? ans.choice : undefined;
        const correctIdx = typeof q?.correct === 'number' ? q.correct : undefined;
        const choices: string[] = Array.isArray(q?.choices) ? q.choices : [];
        const pickedLetter =
          typeof pickedIdx === 'number' ? String.fromCharCode(65 + pickedIdx) : undefined;
        const correctLetter =
          typeof correctIdx === 'number' ? String.fromCharCode(65 + correctIdx) : undefined;
        const pickedText =
          typeof pickedIdx === 'number' ? clip(choices[pickedIdx] ?? '', 50) : undefined;
        const correctText =
          typeof correctIdx === 'number' ? clip(choices[correctIdx] ?? '', 50) : undefined;
        const status = ans.done ? (ans.correct ? 'correct' : 'incorrect') : 'unanswered';
        const qText = clip(q.question);
        let suffix = '';
        if (pickedLetter)
          suffix += ` · your: ${pickedLetter}${pickedText ? ` “${pickedText}”` : ''}`;
        if (ans.done && correctLetter) {
          // After submission, include the correct option to ground follow‑ups
          suffix += ` · correct: ${correctLetter}${correctText ? ` “${correctText}”` : ''}`;
        }
        lines.push(`  ${i + 1}. ${qText}${suffix} · ${status}`);
      });
    }
    // Fill‑blank summary
    if (Array.isArray(t.fillBlank) && t.fillBlank.length > 0) {
      const a = (attempts.fillBlank || {}) as Record<
        string,
        { answer?: string; revealed?: boolean; correct?: boolean }
      >;
      const items = t.fillBlank.slice(0, 8);
      lines.push('Fill‑in‑the‑blank:');
      items.forEach((it: any, i: number) => {
        const ans = a[it.id] || {};
        const qText = clip(it.prompt);
        const submitted = ans.revealed || typeof ans.answer === 'string';
        const status = submitted ? (ans.correct ? 'correct' : 'incorrect') : 'unanswered';
        let suffix =
          typeof ans.answer === 'string' && ans.answer.trim()
            ? ` · your: ${clip(ans.answer, 30)}`
            : '';
        if (ans.revealed && ans.correct === false && typeof it?.answer === 'string') {
          suffix += ` · correct: ${clip(it.answer, 30)}`;
        }
        lines.push(`  ${i + 1}. ${qText}${suffix} · ${status}`);
      });
    }
    // Open‑ended summary (only signal submission; grading appears separately)
    if (Array.isArray(t.openEnded) && t.openEnded.length > 0) {
      const a = (attempts.open || {}) as Record<string, { answer?: string }>;
      const g = (t.grading || {}) as Record<
        string,
        { score?: number; feedback: string; criteria?: string[] }
      >;
      const items = t.openEnded.slice(0, 6);
      lines.push('Open‑ended:');
      items.forEach((it: any, i: number) => {
        const ans = a[it.id] || {};
        const submitted = typeof ans.answer === 'string' && ans.answer.trim().length > 0;
        const graded = !!g[it.id];
        const qText = clip(it.prompt);
        const suffix = submitted ? ` · submitted${graded ? ' · graded' : ''}` : ' · not submitted';
        lines.push(`  ${i + 1}. ${qText}${suffix}`);
      });
    }
  } catch {}

  if (lines.length === 0) return undefined;
  return lines.join('\n');
}

// Build a full, structured JSON block for the last practice so the model
// has exact items, choices, correct answers, and attempts. This is larger
// than the summary and should be controlled by a UI preference.
export function buildTutorContextFull(t: any | undefined): string | undefined {
  if (!t) return undefined;
  try {
    const out: any = {};
    if (t.title) out.title = String(t.title);
    if (Array.isArray(t.mcq))
      out.mcq = t.mcq.map((q: any) => ({
        id: q.id,
        question: q.question,
        choices: q.choices,
        correct: q.correct,
        explanation: q.explanation,
        topic: q.topic,
        skill: q.skill,
        difficulty: q.difficulty,
      }));
    if (Array.isArray(t.fillBlank))
      out.fill_blank = t.fillBlank.map((it: any) => ({
        id: it.id,
        prompt: it.prompt,
        answer: it.answer,
        aliases: it.aliases,
        explanation: it.explanation,
        topic: it.topic,
        skill: it.skill,
        difficulty: it.difficulty,
      }));
    if (Array.isArray(t.openEnded))
      out.open_ended = t.openEnded.map((it: any) => ({
        id: it.id,
        prompt: it.prompt,
        sample_answer: it.sample_answer,
        rubric: it.rubric,
        topic: it.topic,
        skill: it.skill,
        difficulty: it.difficulty,
      }));
    if (Array.isArray(t.flashcards))
      out.flashcards = t.flashcards.map((it: any) => ({
        id: it.id,
        front: it.front,
        back: it.back,
        hint: it.hint,
        topic: it.topic,
        skill: it.skill,
        difficulty: it.difficulty,
      }));

    const attempts = (t.attempts || {}) as any;
    const grading = (t.grading || {}) as any;
    if (attempts && Object.keys(attempts).length > 0) out.attempts = attempts;
    if (grading && Object.keys(grading).length > 0) out.grading = grading;

    const json = JSON.stringify(out);
    if (!json || json === '{}') return undefined;
    return json;
  } catch {
    return undefined;
  }
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
  ];
}
