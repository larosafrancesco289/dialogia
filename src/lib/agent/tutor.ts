// Tutor mode: system preamble and tool definitions
// The tools are presentation-only: the model generates the content and
// supplies it as arguments, which the UI renders as interactive widgets.

import type { ToolDefinition } from '@/lib/agent/types';

export function getTutorPreamble() {
  return [
    'CORE IDENTITY',
    'You are an expert, endlessly patient tutor who helps learners master complex topics through adaptive, tool-assisted instruction.',
    'Use evidence-based teaching patterns:',
    '- Socratic questioning (ask before telling)',
    '- Retrieval practice (active recall)',
    '- Spaced repetition (review at intervals)',
    '- Scaffolding (adjust support level)',
    '- Growth mindset messaging (normalize struggle, celebrate progress)',
    '',
    'AVAILABLE TOOLS',
    '- ask_student_question: gather structured info about goals, timeline, preferences',
    '- create_diagnostic: deliver short diagnostic quizzes before planning or when validating mastery',
    '- generate_plan: share a fully-formed learning plan for approval',
    '- update_plan: propose plan adjustments (insert review, reprioritize topics, etc.)',
    '- get_plan_suggestions: log structured recommendations for plan evolution',
    '- assess_answer: record evidence from a learner response (correctness, misconceptions)',
    '- update_learner_model: update confidence, misconceptions, and notes for a plan node',
    '- quiz_mcq / quiz_fill_blank / quiz_open_ended / flashcards: interactive practice widgets',
    '- grade_open_response: score and give feedback on open responses',
    '- add_to_deck / srs_review: manage spaced-repetition flashcards',
    '',
    'TOOL USAGE PLAYBOOK',
    'Before generating a plan:',
    '1. Use ask_student_question to clarify goals, timeline, and preferences (1–4 focused questions).',
    '2. If learner claims prior knowledge, run create_diagnostic to confirm.',
    '3. Submit generate_plan with a structured plan. Require learner confirmation before teaching.',
    '',
    'During sessions:',
    '- Consult the current plan node before each action.',
    '- After significant learner answers, call assess_answer followed by update_learner_model.',
    '- Use quiz_mcq (2–3 items) for targeted retrieval; favor detailed feedback when misconceptions appear.',
    '- Propose update_plan when confidence drops <50%, repeated misconceptions appear, or learner requests changes.',
    '',
    'Progression guidance:',
    '- Confidence <50% → keep teaching with scaffolding and hints.',
    '- Confidence 50–75% → guided practice, review common errors.',
    '- Confidence >75% → challenge problems and readiness checks.',
    '- Confidence ≥80% with ≥5 interactions → consider advancing via plan update.',
    '',
    'COMMUNICATION STYLE',
    '- Warm, encouraging, never judgmental.',
    '- Default to brief replies (2–5 sentences) with one focused question at a time.',
    '- Invite learners to share notes, screenshots, or PDFs.',
    '- Praise progress explicitly; normalize difficulty (“This part is tricky for everyone”).',
    '- If tools unavailable, still respond with actionable, confidence-building guidance.',
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
    if (t.questionnaire && Array.isArray(t.questionnaire.questions)) {
      const status =
        t.questionnaire.status === 'submitted' ? 'submitted' : 'awaiting-response';
      lines.push(`Questionnaire: ${status}`);
      if (status === 'submitted' && t.questionnaire.responses) {
        const entries = Object.entries(t.questionnaire.responses).slice(0, 3);
        entries.forEach(([qid, answers]) => {
          const question = t.questionnaire.questions.find((q: any) => q.id === qid);
          const label = question?.question ? clip(question.question, 70) : qid;
          const formatted = Array.isArray(answers) ? answers.join(', ') : String(answers);
          lines.push(`  · ${label}: ${clip(formatted, 60)}`);
        });
      }
    }
    if (t.planProposal && t.planProposal.plan) {
      const plan = t.planProposal.plan;
      const status = t.planProposal.status || 'pending';
      const nodes = Array.isArray(plan.nodes) ? plan.nodes.length : 0;
      lines.push(
        `Plan Proposal: ${clip(plan.goal, 60)} · ${nodes} topics · status: ${status}`,
      );
    }
    if (Array.isArray(t.planSuggestions) && t.planSuggestions.length > 0) {
      lines.push(
        `Plan suggestions: ${t.planSuggestions
          .slice(0, 3)
          .map((s: any) => s?.action)
          .filter(Boolean)
          .join(', ')}`,
      );
    }
    if (t.diagnostic && Array.isArray(t.diagnostic.items) && t.diagnostic.items.length > 0) {
      const status = t.diagnostic.status || 'pending';
      const score =
        typeof t.diagnostic.score === 'number'
          ? `${Math.round(t.diagnostic.score * 100)}%`
          : undefined;
      lines.push(
        `Diagnostic: ${clip(t.diagnostic.topic || 'untitled', 40)} · ${status}${
          score ? ` · ${score}` : ''
        }`,
      );
    }
    if (Array.isArray(t.assessmentUpdates) && t.assessmentUpdates.length > 0) {
      const items = t.assessmentUpdates.slice(0, 3).map((u: any) => {
        const nodeLabel = typeof u.nodeId === 'string' ? u.nodeId : 'unknown';
        const before =
          typeof u.confidenceBefore === 'number' ? Math.round(u.confidenceBefore * 100) : null;
        const after =
          typeof u.confidenceAfter === 'number' ? Math.round(u.confidenceAfter * 100) : null;
        if (before != null && after != null) return `${nodeLabel} ${before}%→${after}%`;
        if (after != null) return `${nodeLabel} ${after}%`;
        return nodeLabel;
      });
      lines.push(`Learner model updates: ${items.join('; ')}`);
    }

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
    if (t.questionnaire)
      out.questionnaire = {
        status: t.questionnaire.status,
        submittedAt: t.questionnaire.submittedAt,
        questions: Array.isArray(t.questionnaire.questions)
          ? t.questionnaire.questions.map((q: any) => ({
              id: q.id,
              question: q.question,
              category: q.category,
              allowMultiple: q.allowMultiple,
              followUpBehavior: q.followUpBehavior,
              options: q.options,
            }))
          : [],
        responses: t.questionnaire.responses,
      };
    if (t.planProposal && t.planProposal.plan)
      out.plan_proposal = {
        status: t.planProposal.status,
        requiresConfirmation: t.planProposal.requiresConfirmation,
        confirmationMessage: t.planProposal.confirmationMessage,
        requestedAt: t.planProposal.requestedAt,
        resolvedAt: t.planProposal.resolvedAt,
        plan: t.planProposal.plan,
      };
    if (Array.isArray(t.planSuggestions))
      out.plan_suggestions = t.planSuggestions.map((s: any) => ({
        action: s.action,
        priority: s.priority,
        description: s.description,
        rationale: s.rationale,
        estimatedImpact: s.estimatedImpact,
        implementationDetails: s.implementationDetails,
      }));
    if (t.diagnostic)
      out.diagnostic = {
        diagnosticId: t.diagnostic.diagnosticId,
        topic: t.diagnostic.topic,
        depth: t.diagnostic.depth,
        status: t.diagnostic.status,
        score: t.diagnostic.score,
        items: Array.isArray(t.diagnostic.items)
          ? t.diagnostic.items.map((di: any) => ({
              id: di.id,
              question: di.question,
              choices: di.choices,
              correct: di.correct,
              explanation: di.explanation,
              skill: di.skill,
              difficulty: di.difficulty,
            }))
          : [],
        interpretation: t.diagnostic.interpretation,
      };
    if (Array.isArray(t.assessmentUpdates))
      out.assessment_updates = t.assessmentUpdates.map((u: any) => ({
        nodeId: u.nodeId,
        confidenceBefore: u.confidenceBefore,
        confidenceAfter: u.confidenceAfter,
        masteryLevel: u.masteryLevel,
        tutorComment: u.tutorComment,
        evidence: Array.isArray(u.evidence)
          ? u.evidence.map((ev: any) => ({
              question: ev.question,
              studentAnswer: ev.studentAnswer,
              correctAnswer: ev.correctAnswer,
              result: ev.result,
              questionType: ev.questionType,
              skill: ev.skill,
              difficulty: ev.difficulty,
              hintsUsed: ev.hintsUsed,
              feedback: ev.feedback,
            }))
          : [],
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

export function getTutorToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'ask_student_question',
        description:
          'Present a structured questionnaire to the learner. Use to clarify goals, timeline, and preferences before generating a plan.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Optional heading shown above the questionnaire' },
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
    },
    {
      type: 'function',
      function: {
        name: 'create_diagnostic',
        description:
          'Create a short diagnostic assessment from supplied items. Use before plan generation or when verifying mastery claims.',
        parameters: {
          type: 'object',
          properties: {
            diagnosticId: { type: 'string', description: 'Stable identifier for this diagnostic' },
            topic: { type: 'string', description: 'Topic or skill focus (e.g., "calculus foundations")' },
            depth: {
              type: 'string',
              enum: ['quick', 'moderate', 'comprehensive'],
              description: 'Scope of diagnostic (quick=3-5 Qs, moderate=8-12, comprehensive=15-20)',
            },
            adaptToAnswers: {
              type: 'boolean',
              description: 'If true, difficulty should adapt based on responses',
            },
            quiz: {
              type: 'object',
              description: 'Assessment items rendered to the learner',
              properties: {
                type: {
                  type: 'string',
                  enum: ['mcq', 'mixed'],
                },
                items: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 20,
                  items: {
                    type: 'object',
                    required: ['question', 'choices'],
                    properties: {
                      id: { type: 'string' },
                      question: { type: 'string' },
                      choices: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 6,
                        items: { type: 'string' },
                      },
                      correct: {
                        type: 'integer',
                        minimum: 0,
                        maximum: 5,
                        description: 'Index of correct choice (0-based)',
                      },
                      explanation: { type: 'string' },
                      skill: { type: 'string' },
                      difficulty: {
                        type: 'string',
                        enum: ['beginner', 'intermediate', 'advanced', 'mixed', 'easy', 'medium', 'hard'],
                      },
                    },
                  },
                },
                interpretation: {
                  type: 'object',
                  description: 'Mapping of score ranges to interpretations (e.g., "0-40%": "...")',
                  additionalProperties: { type: 'string' },
                },
              },
              required: ['items'],
            },
          },
          required: ['quiz'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_plan',
        description:
          'Submit a fully-formed learning plan for student review. Include prerequisite structure, objectives, and estimates.',
        parameters: {
          type: 'object',
          properties: {
            plan: {
              type: 'object',
              required: ['goal', 'nodes'],
              properties: {
                goal: { type: 'string' },
                metadata: {
                  type: 'object',
                  properties: {
                    estimatedHours: { type: 'number' },
                    difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
                    prerequisites: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
                nodes: {
                  type: 'array',
                  minItems: 1,
                  maxItems: 20,
                  items: {
                    type: 'object',
                    required: ['id', 'name', 'objectives'],
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      objectives: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 6,
                        items: { type: 'string' },
                      },
                      prerequisites: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      estimatedMinutes: { type: 'number' },
                      status: {
                        type: 'string',
                        enum: ['not_started', 'in_progress', 'completed'],
                      },
                      resources: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            type: { type: 'string', enum: ['reading', 'video', 'practice'] },
                            title: { type: 'string' },
                            url: { type: 'string' },
                          },
                        },
                      },
                      children: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
            requiresConfirmation: {
              type: 'boolean',
              description: 'Whether the student must approve before adopting the plan',
            },
            confirmationMessage: {
              type: 'string',
              description: 'Message presented when asking the student to approve the plan',
            },
            suggestions: {
              type: 'array',
              description: 'Optional structured recommendations related to this plan',
              items: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  estimatedImpact: { type: 'string' },
                  implementationDetails: { type: 'object' },
                },
              },
            },
          },
          required: ['plan'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_plan',
        description:
          'Propose modifications to the active learning plan (e.g., add review, reprioritize topics). Provide an updated plan snapshot.',
        parameters: {
          type: 'object',
          properties: {
            plan: {
              type: 'object',
              required: ['goal', 'nodes'],
              properties: {
                goal: { type: 'string' },
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['id', 'name', 'objectives'],
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      objectives: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      prerequisites: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      status: {
                        type: 'string',
                        enum: ['not_started', 'in_progress', 'completed'],
                      },
                      estimatedMinutes: { type: 'number' },
                      resources: { type: 'array', items: { type: 'object' } },
                      children: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
            reason: {
              type: 'string',
              description: 'Rationale for the proposed change (explained to learner)',
            },
            requiresConfirmation: {
              type: 'boolean',
              description: 'If true, student is asked before applying change',
            },
            confirmationMessage: { type: 'string' },
            suggestions: {
              type: 'array',
              items: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  estimatedImpact: { type: 'string' },
                  implementationDetails: { type: 'object' },
                },
              },
            },
          },
          required: ['plan'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_plan_suggestions',
        description:
          'Record structured plan improvement suggestions (used when learner struggles or excels).',
        parameters: {
          type: 'object',
          properties: {
            suggestions: {
              type: 'array',
              minItems: 1,
              maxItems: 6,
              items: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string', description: 'Suggested action, e.g., insert_review' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                  description: { type: 'string' },
                  rationale: { type: 'string' },
                  estimatedImpact: { type: 'string' },
                  implementationDetails: { type: 'object' },
                },
              },
            },
          },
          required: ['suggestions'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'assess_answer',
        description:
          'Log assessment of a student response and extract evidence (correctness, misconceptions).',
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Learning plan node this evidence maps to' },
            interaction: {
              type: 'object',
              required: ['question', 'studentAnswer'],
              properties: {
                question: { type: 'string' },
                studentAnswer: { type: 'string' },
                correctAnswer: { type: 'string' },
                questionType: {
                  type: 'string',
                  enum: ['mcq', 'fill-blank', 'open-ended', 'explanation', 'application'],
                },
                skill: { type: 'string' },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                hintsUsed: { type: 'number', minimum: 0, maximum: 5 },
                correct: { type: 'boolean' },
              },
            },
          },
          required: ['nodeId', 'interaction'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_learner_model',
        description:
          'Update the learner model with structured evidence and notes (confidence adjustments, misconceptions).',
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            evidence: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              items: {
                type: 'object',
                required: ['type', 'weight'],
                properties: {
                  type: {
                    type: 'string',
                    enum: [
                      'correct_answer',
                      'incorrect_answer',
                      'partial_answer',
                      'hint_needed',
                      'explanation_requested',
                      'misconception_detected',
                      'insight_demonstrated',
                    ],
                  },
                  weight: { type: 'number', minimum: -1, maximum: 1 },
                  skill: { type: 'string' },
                  details: { type: 'string' },
                },
              },
            },
            misconceptions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  description: { type: 'string' },
                  severity: { type: 'string', enum: ['minor', 'moderate', 'major'] },
                  examples: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            notes: { type: 'string' },
          },
          required: ['nodeId', 'evidence'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'quiz_mcq',
        description:
          'Render multiple-choice questions as interactive widgets. Supply fully-formed items or describe generation parameters.',
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
                required: ['question', 'choices', 'correct'],
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
              },
            },
            generateFrom: {
              type: 'object',
              description: 'If provided, the system can synthesize items instead of using provided ones.',
              properties: {
                nodeId: { type: 'string' },
                skill: { type: 'string' },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'adaptive'] },
                count: { type: 'integer', minimum: 1, maximum: 10 },
                focusOn: { type: 'array', items: { type: 'string' } },
              },
            },
            adaptiveDifficulty: {
              type: 'boolean',
              description: 'Adjust question difficulty based on recent performance',
            },
            provideFeedback: {
              type: 'string',
              enum: ['minimal', 'standard', 'detailed'],
              description: 'Level of feedback after answers',
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
        description: 'Render fill-in-the-blank practice items.',
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
                required: ['prompt', 'answer'],
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
        description: 'Render open-ended prompts for written responses.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 10,
              items: {
                type: 'object',
                required: ['prompt'],
                properties: {
                  id: { type: 'string' },
                  prompt: { type: 'string' },
                  sample_answer: { type: 'string' },
                  rubric: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
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
        description: 'Render flashcards for active recall practice.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 30,
              items: {
                type: 'object',
                required: ['front', 'back'],
                properties: {
                  id: { type: 'string' },
                  front: { type: 'string' },
                  back: { type: 'string' },
                  hint: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                },
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
        description:
          'Provide grading feedback for an open-ended response previously rendered via quiz_open_ended.',
        parameters: {
          type: 'object',
          properties: {
            item_id: { type: 'string' },
            score: { type: 'number' },
            feedback: { type: 'string' },
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
        description: 'Add flashcards to the spaced repetition deck for this chat.',
        parameters: {
          type: 'object',
          properties: {
            cards: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  front: { type: 'string' },
                  back: { type: 'string' },
                  hint: { type: 'string' },
                  topic: { type: 'string' },
                  skill: { type: 'string' },
                },
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
        description: 'Retrieve upcoming spaced-repetition cards for review.',
        parameters: {
          type: 'object',
          properties: {
            due_count: { type: 'number', minimum: 1, maximum: 40 },
          },
        },
      },
    },
  ];
}
