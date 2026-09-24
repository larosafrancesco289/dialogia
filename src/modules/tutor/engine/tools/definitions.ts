// Module: tutor engine tool definitions
// Responsibility: the tutor tools, and their argument schemas and descriptions as the model reads them.

import { z } from 'zod';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import type { TutorToolName } from '@/modules/tutor/engine/commands';
import {
  BUDGETS,
  LIMITS,
  MASTERY_EVIDENCE_MIN,
  MASTERY_PRIOR,
  OBSERVATION_KINDS,
  OBSERVATION_WEIGHTS,
  READY,
  STARTING_ESTIMATE_MAX,
  STARTING_ESTIMATE_SAID_MAX,
  WEIGHT_MAX,
  WEIGHT_MIN,
  percent,
} from '@/modules/tutor/engine/rules';

export const TUTOR_TOOL_NAMES: readonly TutorToolName[] = [
  'ask_intake',
  'give_diagnostic',
  'propose_plan',
  'give_quiz',
  'record_evidence',
  'note_misconception',
  'resolve_misconception',
  'complete_topic',
  'start_topic',
];

/** Tools that put a card in front of the learner; the turn ends until they respond. */
export const TOOL_ENDS_TURN: Record<TutorToolName, boolean> = {
  ask_intake: true,
  give_diagnostic: true,
  propose_plan: true,
  give_quiz: true,
  record_evidence: false,
  note_misconception: false,
  resolve_misconception: false,
  complete_topic: false,
  start_topic: false,
};

const signed = (weight: number) => (weight > 0 ? `+${weight}` : String(weight));

const topicId = z.string().describe('Topic id exactly as shown in [brackets] in the tutor state.');

const choiceItem = z.object({
  question: z.string().min(1),
  choices: z.array(z.string().min(1)).min(LIMITS.choices.min).max(LIMITS.choices.max),
  correct: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.choices.max - 1)
    .describe(
      '0-based index of the right choice. The engine grades with it; it is never shown back to you.',
    ),
  explanation: z.string().optional().describe('Shown to the learner after they answer.'),
});

export const ARGS = {
  ask_intake: z.object({
    title: z.string().optional(),
    questions: z
      .array(
        z.object({
          question: z.string().min(1),
          category: z.string().optional().describe('Short label, e.g. Goal, Background, Time.'),
          allowMultiple: z.boolean().optional(),
          options: z
            .array(z.object({ label: z.string().min(1), description: z.string().optional() }))
            .min(LIMITS.intakeOptions.min)
            .max(LIMITS.intakeOptions.max),
        }),
      )
      .min(LIMITS.intakeQuestions.min)
      .max(LIMITS.intakeQuestions.max),
  }),
  give_diagnostic: z.object({
    topic: z.string().min(1).describe('What the diagnostic probes, in a few words.'),
    items: z
      .array(
        choiceItem.extend({
          topicId: topicId
            .optional()
            .describe('Plan topic this item probes. Only when a plan exists.'),
        }),
      )
      .min(LIMITS.diagnosticItems.min)
      .max(LIMITS.diagnosticItems.max),
  }),
  propose_plan: z.object({
    goal: z.string().min(1),
    rationale: z
      .string()
      .optional()
      .describe('Why this plan, in one or two sentences for the learner.'),
    topics: z
      .array(
        z.object({
          id: z
            .string()
            .optional()
            .describe('Reuse an existing topic id to keep its progress. Omit for a new topic.'),
          name: z.string().min(1),
          description: z.string().optional(),
          objectives: z
            .array(z.string().min(1))
            .min(LIMITS.objectives.min)
            .max(LIMITS.objectives.max)
            .describe('Verifiable outcomes: what the learner will be able to do.'),
          prerequisites: z
            .array(z.string())
            .optional()
            .describe('Ids or names of other topics in this proposal that must come first.'),
          startingEstimate: z
            .object({
              value: z
                .number()
                .min(0)
                .max(STARTING_ESTIMATE_MAX)
                .describe(
                  `Where the topic's mastery starts, 0-${STARTING_ESTIMATE_MAX} (default ${MASTERY_PRIOR}).`,
                ),
              reason: z
                .string()
                .optional()
                .describe('The evidence, in one short sentence the learner may read.'),
            })
            .optional()
            .describe(
              `Only for a topic the learner said they know, or a diagnostic tested; knowing a prerequisite is not knowing the topic. Up to ${percent(STARTING_ESTIMATE_SAID_MAX)}% on their word, ${percent(STARTING_ESTIMATE_MAX)}% after a diagnostic. Omit otherwise.`,
            ),
        }),
      )
      .min(LIMITS.planNodes.min)
      .max(LIMITS.planNodes.max)
      .describe('In teaching order.'),
  }),
  give_quiz: z.object({
    title: z.string().optional(),
    items: z.array(choiceItem).min(LIMITS.quizItems.min).max(LIMITS.quizItems.max),
  }),
  record_evidence: z.object({
    kind: z
      .enum(OBSERVATION_KINDS)
      .describe(
        'struggled: an answer with an error in it, or stuck. partial: right as far as it went, but incomplete. applied, explained, insight: right, on their own.',
      ),
    note: z
      .string()
      .min(1)
      .describe(
        'What the learner said or did, quoting or paraphrasing their answer, in one short sentence they may read. Not what you said.',
      ),
    topicId: topicId.optional().describe('Defaults to the current topic.'),
    weight: z
      .number()
      .min(WEIGHT_MIN)
      .max(WEIGHT_MAX)
      .optional()
      .describe(
        `How far this moves the estimate. Omit for the default per kind (${OBSERVATION_KINDS.map((k) => `${k} ${signed(OBSERVATION_WEIGHTS[k])}`).join(', ')}); its sign must match the kind.`,
      ),
    helped: z
      .boolean()
      .optional()
      .describe(
        'true when your message just before told them the move they then made: what to do on this problem, the part to fix, the answer as one of two options, the explanation they are giving back, or the correction they are repeating. false when you only asked and the move was theirs, even right after you corrected or explained the rule. The estimate then moves less (partial: not at all).',
      ),
    source: z
      .enum(['observation', 'learner_said'])
      .default('observation')
      .describe('learner_said: the learner told you about their own understanding.'),
  }),
  note_misconception: z.object({
    description: z.string().min(1).describe('The mistaken belief, stated plainly.'),
    topicId: topicId.optional().describe('Defaults to the current topic.'),
    shownBy: z
      .enum(['latest_answer', 'earlier_answer'])
      .default('latest_answer')
      .describe(
        'Which answer showed it. latest_answer: the one you are responding to, which then earns nothing on the topic. earlier_answer: an answer before it that was already recorded as a mistake, when their latest answer is right; the latest answer keeps its credit.',
      ),
  }),
  resolve_misconception: z.object({
    misconceptionId: z.string().min(1).describe('Id as listed under open misconceptions.'),
    topicId: topicId.optional(),
    note: z.string().optional().describe('What showed it is resolved.'),
  }),
  complete_topic: z.object({
    how: z
      .enum(['mastered', 'skipped'])
      .default('mastered')
      .describe(
        'skipped: only when the learner asked to skip this very topic, not because they know what it builds on.',
      ),
    note: z.string().optional().describe('One line on how the topic went.'),
    topicId: topicId.optional().describe('Defaults to the current topic.'),
  }),
  start_topic: z.object({ topicId }),
} satisfies Record<TutorToolName, z.ZodTypeAny>;

const DESCRIPTIONS: Record<TutorToolName, string> = {
  ask_intake: `Show the learner a short intake card (${LIMITS.intakeQuestions.min}-${LIMITS.intakeQuestions.max} multiple-choice questions) about their goal, background, and constraints. Use at the start, before any plan, when you cannot infer these from the chat. Always include a "complete beginner" option when asking about prior knowledge. Do not use once a plan exists. Ends your turn: the learner answers on the card.`,
  give_diagnostic: `Show a short multiple-choice pre-assessment (${LIMITS.diagnosticItems.min}-${LIMITS.diagnosticItems.max} items) to check prior knowledge before planning, or before the next topic at a chapter break. The engine scores it and records the evidence. Use when the learner's level is unclear; skip it when they have told you plainly. At most ${BUDGETS.diagnosticsPerSession} per session. Ends your turn.`,
  propose_plan: `Propose a learning plan, or a revision: the goal and ${LIMITS.planNodes.min}-${LIMITS.planNodes.max} topics in teaching order, each with objectives and prerequisites. startingEstimate only for a topic the learner said they know or a diagnostic tested, not for knowing its prerequisites (at most ${percent(STARTING_ESTIMATE_SAID_MAX)}% on their word, ${percent(STARTING_ESTIMATE_MAX)}% after a diagnostic); on approval it becomes evidence they can contest. Closes an unanswered intake, so propose when they would rather skip the questions. The learner approves or declines the card; nothing changes until they approve. In a revision, reuse topic ids to keep their progress. Propose at seams (after intake, at a chapter break, when the plan is done, or when asked), not mid-explanation. Ends your turn.`,
  give_quiz: `Show a multiple-choice quiz (${LIMITS.quizItems.min}-${LIMITS.quizItems.max} items) on the current topic. The engine grades each answer and updates mastery; do not record quiz results yourself. Use after teaching a piece of the topic to check it has landed. At most ${BUDGETS.quizzesPerTopic} per topic. Ends your turn.`,
  record_evidence: `Record what the conversation showed about the learner's grasp of a topic, judged from their own words: struggled (an answer with an error in it, even if part was right, or stuck), partial (right as far as it went, but incomplete), applied (used it correctly), explained (explained it back), insight (went beyond what was taught). helped: when your last message told them the move they made; not when you only asked. One call per topic per reply, summing up the exchange; a reply that notes a misconception on a topic gains nothing on it. Source "learner_said" when they tell you about their own understanding. Not for quiz or diagnostic answers. Does not end your turn.`,
  note_misconception: `Note a specific mistaken belief the learner showed (not a slip). It is shown to the learner and blocks completing the topic as mastered until resolved. Noting the same description again counts another occurrence. Say which answer showed it: the latest one earns nothing on the topic this reply; an earlier one, already recorded as a mistake, leaves the latest answer's credit standing. Does not end your turn.`,
  resolve_misconception: `Mark an open misconception resolved once the learner has shown the correct understanding. Does not end your turn.`,
  complete_topic: `Finish the current topic. With how "mastered" it needs mastery of at least ${percent(READY)}%, at least ${MASTERY_EVIDENCE_MIN} pieces of evidence from the learner's work this session (quiz or diagnostic answers, or your observations; a starting estimate does not count), and no open misconceptions. It does not start the next topic: the learner sees a chapter break and chooses what comes next, so do not call start_topic in the same reply. Use when the topic's objectives are met; do not use to move on while evidence is thin. Does not end your turn.`,
  start_topic: `Start a topic whose prerequisites are done. Use at a chapter break, in a later reply than the one that completed the topic, when the learner says in chat that they want to go on (they may also press Go on themselves). Returns the topic's objectives. Does not end your turn.`,
};

export const TUTOR_TOOLS: Record<TutorToolName, ToolDefinition> = Object.fromEntries(
  TUTOR_TOOL_NAMES.map((name) => [
    name,
    {
      type: 'function',
      function: { name, description: DESCRIPTIONS[name], parameters: toJsonSchema(ARGS[name]) },
    },
  ]),
) as Record<TutorToolName, ToolDefinition>;
