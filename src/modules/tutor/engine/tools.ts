// Module: tutor engine tools
// Responsibility: which tutor tools exist in a state, their JSON-schema definitions, argument parsing into commands, and compact results.

import { z } from 'zod';
import type { ToolDefinition } from '@/lib/transport/contracts';
import { toJsonSchema } from '@/lib/schemas/jsonSchema';
import {
  gateTutorTool,
  type TutorError,
  type TutorToolCommand,
  type TutorToolName,
} from '@/modules/tutor/engine/commands';
import type { TutorEvent } from '@/modules/tutor/engine/events';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import { nextReadyNode } from '@/modules/tutor/engine/plan';
import {
  BUDGETS,
  LIMITS,
  OBSERVATION_KINDS,
  READY,
  WEIGHT_MAX,
  WEIGHT_MIN,
  masteryBand,
  percent,
} from '@/modules/tutor/engine/rules';
import { confidenceOf, remainingBudgets, type TutorState } from '@/modules/tutor/engine/state';

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

// ---------------------------------------------------------------- schemas

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

const ARGS = {
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
    kind: z.enum(OBSERVATION_KINDS),
    note: z.string().min(1).describe('What you saw, in one short sentence the learner may read.'),
    topicId: topicId.optional().describe('Defaults to the current topic.'),
    weight: z
      .number()
      .min(WEIGHT_MIN)
      .max(WEIGHT_MAX)
      .optional()
      .describe(
        'How far this moves the estimate. Omit for the default per kind (explained +0.2, applied +0.3, insight +0.3, partial +0.1, struggled -0.2).',
      ),
    source: z
      .enum(['observation', 'learner_said'])
      .default('observation')
      .describe('learner_said: the learner told you about their own understanding.'),
    setTo: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('learner_said only: the value the learner says their mastery should be (0-1).'),
  }),
  note_misconception: z.object({
    description: z.string().min(1).describe('The mistaken belief, stated plainly.'),
    topicId: topicId.optional().describe('Defaults to the current topic.'),
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
      .describe('skipped: only when the learner asked to move on before mastering it.'),
    note: z.string().optional().describe('One line on how the topic went.'),
    topicId: topicId.optional().describe('Defaults to the current topic.'),
  }),
  start_topic: z.object({ topicId }),
} satisfies Record<TutorToolName, z.ZodTypeAny>;

const DESCRIPTIONS: Record<TutorToolName, string> = {
  ask_intake: `Show the learner a short intake card (${LIMITS.intakeQuestions.min}-${LIMITS.intakeQuestions.max} multiple-choice questions) about their goal, background, and constraints. Use at the start, before any plan, when you cannot infer these from the chat. Always include a "complete beginner" option when asking about prior knowledge. Do not use once a plan exists. Ends your turn: the learner answers on the card.`,
  give_diagnostic: `Show a short multiple-choice pre-assessment (${LIMITS.diagnosticItems.min}-${LIMITS.diagnosticItems.max} items) to check prior knowledge before planning, or before the next topic at a chapter break. The engine scores it and records the evidence. Use when the learner's level is unclear; skip it when they have told you plainly. At most ${BUDGETS.diagnosticsPerSession} per session. Ends your turn.`,
  propose_plan: `Propose a learning plan, or a revision of the current one: the goal and ${LIMITS.planNodes.min}-${LIMITS.planNodes.max} topics in teaching order, each with objectives and prerequisites. The learner sees it as a card and approves or declines; nothing changes until they approve. In a revision, reuse existing topic ids to keep their progress. Propose at seams (after intake, at a chapter break, when the plan is done, or when the learner asks), not mid-explanation. Ends your turn.`,
  give_quiz: `Show a multiple-choice quiz (${LIMITS.quizItems.min}-${LIMITS.quizItems.max} items) on the current topic. The engine grades each answer and updates mastery; do not record quiz results yourself. Use after teaching a piece of the topic to check it has landed. At most ${BUDGETS.quizzesPerTopic} per topic. Ends your turn.`,
  record_evidence: `Record what you observed in conversation about the learner's understanding of a topic: explained (they explained it back), applied (they used it correctly), insight (they went beyond what was taught), partial, or struggled. Also use source "learner_said" when the learner tells you about their own understanding. It updates the mastery estimate the learner sees. Do not use for quiz or diagnostic answers; the engine already scored those. Does not end your turn.`,
  note_misconception: `Note a specific mistaken belief the learner showed (not a slip). It is shown to the learner and blocks completing the topic as mastered until resolved. Noting the same description again counts another occurrence. Does not end your turn.`,
  resolve_misconception: `Mark an open misconception resolved once the learner has shown the correct understanding. Does not end your turn.`,
  complete_topic: `Finish the current topic. With how "mastered" it needs mastery of at least ${percent(READY)}% and no open misconceptions. It does not start the next topic: the learner sees a chapter break and chooses what comes next. Use when the topic's objectives are met; do not use to move on while evidence is thin. Does not end your turn.`,
  start_topic: `Start a topic whose prerequisites are done. Use at a chapter break when the learner says in chat that they want to go on (they may also press Go on themselves). Returns the topic's objectives. Does not end your turn.`,
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

// ---------------------------------------------------------------- availability

/** Exactly the tools `decide` would not refuse on phase, open card, flags or budget. */
export function availableTutorTools(state: TutorState, flags: TutorFlags): TutorToolName[] {
  return TUTOR_TOOL_NAMES.filter((name) => gateTutorTool(state, flags, name) === null);
}

export function tutorToolDefinitions(state: TutorState, flags: TutorFlags): ToolDefinition[] {
  return availableTutorTools(state, flags).map((name) => TUTOR_TOOLS[name]);
}

// ---------------------------------------------------------------- parsing

export type ParsedToolCall =
  | { ok: true; command: TutorToolCommand }
  | { ok: false; error: TutorError };

function isToolName(name: string): name is TutorToolName {
  return (TUTOR_TOOL_NAMES as readonly string[]).includes(name);
}

/** Tool-call arguments (object or JSON string) into a command, or a structured error. */
export function parseTutorToolCall(name: string, rawArgs: unknown): ParsedToolCall {
  if (!isToolName(name)) {
    return {
      ok: false,
      error: {
        code: 'unknown_tool',
        message: `There is no tutor tool "${name}".`,
        hint: `Tutor tools: ${TUTOR_TOOL_NAMES.join(', ')}.`,
      },
    };
  }
  let input = rawArgs ?? {};
  if (typeof input === 'string') {
    try {
      input = input.trim() ? JSON.parse(input) : {};
    } catch {
      return {
        ok: false,
        error: {
          code: 'invalid_arguments',
          message: 'The arguments are not valid JSON.',
          hint: `Call ${name} again with a JSON object.`,
        },
      };
    }
  }
  const parsed = ARGS[name].safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map(
        (issue) => `${issue.path.length ? issue.path.join('.') : 'arguments'}: ${issue.message}`,
      );
    return {
      ok: false,
      error: {
        code: 'invalid_arguments',
        message: issues.join('; '),
        hint: `Call ${name} again with arguments that match its schema.`,
      },
    };
  }
  return { ok: true, command: toCommand(name, parsed.data) };
}

function toCommand(name: TutorToolName, data: unknown): TutorToolCommand {
  switch (name) {
    case 'ask_intake':
      return { by: 'tutor', type: name, ...(data as z.infer<(typeof ARGS)['ask_intake']>) };
    case 'give_diagnostic': {
      const args = data as z.infer<(typeof ARGS)['give_diagnostic']>;
      return {
        by: 'tutor',
        type: name,
        topic: args.topic,
        items: args.items.map(({ topicId: nodeId, ...item }) => ({ ...item, nodeId })),
      };
    }
    case 'propose_plan': {
      const args = data as z.infer<(typeof ARGS)['propose_plan']>;
      return {
        by: 'tutor',
        type: name,
        goal: args.goal,
        rationale: args.rationale,
        nodes: args.topics,
      };
    }
    case 'give_quiz':
      return { by: 'tutor', type: name, ...(data as z.infer<(typeof ARGS)['give_quiz']>) };
    case 'record_evidence': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['record_evidence']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'note_misconception': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['note_misconception']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'resolve_misconception': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['resolve_misconception']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'complete_topic': {
      const { topicId: nodeId, ...args } = data as z.infer<(typeof ARGS)['complete_topic']>;
      return { by: 'tutor', type: name, nodeId, ...args };
    }
    case 'start_topic': {
      const args = data as z.infer<(typeof ARGS)['start_topic']>;
      return { by: 'tutor', type: name, nodeId: args.topicId };
    }
  }
}

// ---------------------------------------------------------------- results

export type ToolResult = Record<string, unknown>;

export function tutorToolError(error: TutorError): ToolResult {
  return { ok: false, error: error.code, message: error.message, hint: error.hint };
}

function topicSummary(state: TutorState, id: string) {
  const confidence = confidenceOf(state, id);
  return { id, mastery: percent(confidence), band: masteryBand(confidence) };
}

/**
 * What the model reads back after a successful call: the state it needs to
 * carry on, never an answer key.
 */
export function tutorToolResult(
  name: TutorToolName,
  before: TutorState,
  after: TutorState,
  events: readonly TutorEvent[],
): ToolResult {
  const event = events[0];
  switch (name) {
    case 'ask_intake':
      return {
        ok: true,
        shown: 'intake',
        note: 'The learner sees your questions. Wait for their answers.',
      };
    case 'give_diagnostic':
      return {
        ok: true,
        shown: 'diagnostic',
        diagnosticsLeft: remainingBudgets(after).diagnosticsLeft,
        note: 'The learner sees the diagnostic. The engine scores it when they submit.',
      };
    case 'give_quiz':
      return {
        ok: true,
        shown: 'quiz',
        topic: after.currentNodeId,
        quizzesLeft: remainingBudgets(after).quizzesLeft,
        note: 'The learner sees the quiz. The engine grades each answer.',
      };
    case 'propose_plan': {
      const proposal = after.proposal;
      const previous = new Set(before.plan?.nodes.map((n) => n.id) ?? []);
      const ids = proposal?.plan.nodes.map((n) => n.id) ?? [];
      return {
        ok: true,
        shown: 'plan_proposal',
        revision: proposal?.revision ?? false,
        topics: ids,
        ...(previous.size ? { keepsProgressFor: ids.filter((id) => previous.has(id)) } : {}),
        note: 'The learner sees the proposal and will approve or decline it.',
      };
    }
    case 'record_evidence': {
      const nodeId = event?.type === 'evidence_recorded' ? event.nodeId : '';
      return {
        ok: true,
        ...topicSummary(after, nodeId),
        was: percent(confidenceOf(before, nodeId)),
      };
    }
    case 'note_misconception': {
      if (event?.type !== 'misconception_noted') return { ok: true };
      const m = after.mastery[event.nodeId]?.misconceptions.find(
        (x) => x.id === event.misconceptionId,
      );
      return {
        ok: true,
        topic: event.nodeId,
        misconceptionId: event.misconceptionId,
        occurrences: m?.occurrences ?? 1,
      };
    }
    case 'resolve_misconception':
      return event?.type === 'misconception_resolved'
        ? { ok: true, topic: event.nodeId, resolved: event.misconceptionId }
        : { ok: true };
    case 'complete_topic': {
      const nodeId = event?.type === 'topic_completed' ? event.nodeId : '';
      const next = after.phase === 'interlude' ? nextReadyNode(after.plan)?.id : undefined;
      return {
        ok: true,
        phase: after.phase,
        completed: topicSummary(after, nodeId),
        ...(next ? { nextInPlan: next } : {}),
        note:
          after.phase === 'complete'
            ? 'Every topic in the plan is done.'
            : 'The learner now sees a chapter break and chooses what comes next: go on, more practice, or change the path. Close the topic and let them choose; call start_topic only if they ask in chat to go on.',
      };
    }
    case 'start_topic': {
      const node = after.plan?.nodes.find((n) => n.id === after.currentNodeId);
      return {
        ok: true,
        phase: after.phase,
        topic: node
          ? { ...topicSummary(after, node.id), name: node.name, objectives: node.objectives }
          : undefined,
      };
    }
  }
}
