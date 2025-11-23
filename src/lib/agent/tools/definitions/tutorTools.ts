import type { ToolDefinition } from '@/lib/agent/types';

export function getTutorToolDefinitions(): ToolDefinition[] {
  return [
    {
      type: 'function',
      function: {
        name: 'ask_student_question',
        description:
          'Deliver a targeted intake questionnaire that gathers goals, constraints, and preferences before you plan or diagnose. Use it when you need structured answers instead of inferring from chat context, especially at the start of a session or after the learner’s circumstances change. Frame the questions as the basis for diagnostics, plan scope, and tutoring strategy so the learner understands why you are asking.',
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
          'Assemble a short diagnostic assessment to verify prior knowledge, surface misconceptions, or confirm a learner’s claimed mastery before teaching. Use it when you need objective evidence about readiness, and clearly describe topic, depth, and how results will guide the upcoming plan. Provide high-quality items with explanations so the UI can render, score, and report outcomes without extra clarification.',
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
          'Submit a complete learning plan ready for learner review, including goals, prerequisite structure, estimated effort, and sequencing. Use this only after you have gathered requirements (and diagnostics if needed) so the plan feels personalized and actionable. Explain what approval or next steps are required so the learner knows when the plan will be adopted.',
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
          'Propose targeted modifications to the in-progress learning plan—adding review, reprioritizing objectives, or adjusting pacing based on new evidence. Use it instead of regenerating from scratch so approvals and progress tracking remain intact. Always include the updated plan snapshot plus notes about why the learner should accept the change.',
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
          'Capture structured plan improvement ideas that should influence future revisions but do not immediately alter the current plan. Use it when the learner is notably stuck or excelling and you want to log hypotheses—like adding spaced review, changing resources, or adjusting goals—with clear priority. Include rationale and expected impact so later plan updates can act on the evidence.',
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
          'Log a detailed assessment of a learner response, capturing the prompt, their answer, correctness, hints used, and any misconceptions or strengths observed. Use it immediately after meaningful answers so evidence stays aligned with the relevant plan node. The structured record feeds both learner feedback and downstream model updates, so be explicit about skills, difficulty, and what the learner should do next.',
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
        name: 'apply_learner_model_feedback',
        description:
          'Apply learner-provided adjustments to the learner model (nudging confidence up/down, honoring self-reported confidence floors, or resolving misconceptions). Use this when the learner explicitly states their understanding or disputes a misconception so the model stays transparent and editable.',
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string', description: 'Plan node to adjust' },
            direction: { type: 'string', enum: ['up', 'down'], description: 'Nudge confidence up or down by a small, bounded amount' },
            magnitude: { type: 'number', minimum: 0, maximum: 1, description: 'Optional weight for the nudge (default ~0.15)' },
            reason: { type: 'string', description: 'Learner-provided rationale for the adjustment' },
            estimatedConfidence: { type: 'number', minimum: 0, maximum: 1, description: 'Learner-stated confidence to respect as a floor if higher than current' },
            confidenceFloor: { type: 'number', minimum: 0, maximum: 1, description: 'Minimum confidence to keep unless future evidence lowers it' },
            misconceptionId: { type: 'string', description: 'Misconception identifier to resolve if incorrect' },
            misconceptionDescription: { type: 'string', description: 'Text label of the misconception to resolve' },
          },
          required: ['nodeId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_learner_model',
        description:
          'Write structured evidence back to the learner model to adjust confidence, log misconceptions, and capture qualitative notes tied to a specific plan node. Use it after assessments, quizzes, or reflective tutoring moments so longitudinal progress is measurable. Include weighted evidence, before/after confidence, and recommended follow-ups so future planning knows exactly what changed and why.',
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
          'Create a short multiple-choice quiz (typically 2-5 items) for retrieval practice or targeted checks on a specific skill. Use it when you want auto-graded interactions with immediate feedback, and either supply fully formed items or provide generation parameters the UI can expand. Clearly mark the correct option, include explanations, and tag each question with topic, skill, and difficulty so the learner understands the takeaway.',
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
        description:
          'Create fill-in-the-blank items that force the learner to recall exact terms, formulas, or steps without answer choices. Use this immediately after instruction or before advancing to confirm that key language is memorized. Provide accepted answers, aliases, and explanations so the UI can auto-check responses and clarify mistakes.',
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
        description:
          'Deliver open-ended prompts that ask the learner to explain reasoning, show work, or synthesize ideas in their own words. Use it sparingly for deeper checks where automated grading is hard, and include rubrics or sample answers so later grading and feedback stay grounded. Clarify the skill focus, difficulty, and any constraints (length, format) so the learner knows what a strong response looks like.',
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
        description:
          'Deliver a small bundle of flashcards for active recall, typically 2-10 cards tied to the learner’s current plan nodes. Use it when spaced repetition or lightweight reinforcement will help, and include hints or topics so the learner can connect each card to prior instruction. Keep both sides concise and actionable so the cards can later be stored or reviewed in decks.',
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
          'Score and provide feedback on a learner’s open-ended response that was previously delivered via quiz_open_ended. Use it after the learner submits substantial work so you can capture both a rubric-aligned score and narrative coaching. Highlight strengths, specific revision advice, and any rubric criteria that were missed so future plan updates know whether mastery improved.',
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
        description:
          'Add newly created flashcards to the learner’s long-term spaced-repetition deck. Use it when the learner requests persistent review material or when you generate high-value cards that should resurface in future sessions. Provide clear fronts, backs, hints, and topical tags so the deck stays organized.',
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
        description:
          'Fetch the next batch of due spaced-repetition cards so you can walk the learner through a timed review set. Use it when the learner requests SRS practice or when you want to resume a deck mid-session, and specify how many cards (1-40) to pull. The tool returns card fronts, backs, hints, and metadata so you can reference them or surface them in the UI.',
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
