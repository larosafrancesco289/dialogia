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
import type { TutorEvent, TutorEventOf } from '@/modules/tutor/engine/events';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import { nextReadyNode } from '@/modules/tutor/engine/plan';
import {
  BUDGETS,
  LIMITS,
  MASTERY_EVIDENCE_MIN,
  MASTERY_PRIOR,
  OBSERVATION_KINDS,
  OBSERVATION_WEIGHTS,
  READY,
  STARTING_ESTIMATE_MAX,
  WEIGHT_MAX,
  WEIGHT_MIN,
  masteryBand,
  percent,
} from '@/modules/tutor/engine/rules';
import {
  confidenceOf,
  remainingBudgets,
  replyRecord,
  type TutorState,
} from '@/modules/tutor/engine/state';

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
              'Only when intake answers, a diagnostic, or the chat showed prior knowledge of this topic. Omit otherwise.',
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
        'true when your previous message gave, named or hinted at what they then said, or they finished a step you started or repeated your correction back. The estimate then moves less (partial: not at all).',
      ),
    source: z
      .enum(['observation', 'learner_said'])
      .default('observation')
      .describe('learner_said: the learner told you about their own understanding.'),
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
  propose_plan: `Propose a learning plan, or a revision of the current one: the goal and ${LIMITS.planNodes.min}-${LIMITS.planNodes.max} topics in teaching order, each with objectives and prerequisites. Give a startingEstimate (at most ${percent(STARTING_ESTIMATE_MAX)}%) only to topics the intake, a diagnostic or the chat showed you; omit it elsewhere. On approval it becomes evidence the learner can contest. The learner sees the plan as a card and approves or declines; nothing changes until they approve. In a revision, reuse existing topic ids to keep their progress. Propose at seams (after intake, at a chapter break, when the plan is done, or when the learner asks), not mid-explanation. Ends your turn.`,
  give_quiz: `Show a multiple-choice quiz (${LIMITS.quizItems.min}-${LIMITS.quizItems.max} items) on the current topic. The engine grades each answer and updates mastery; do not record quiz results yourself. Use after teaching a piece of the topic to check it has landed. At most ${BUDGETS.quizzesPerTopic} per topic. Ends your turn.`,
  record_evidence: `Record what the conversation showed about the learner's grasp of a topic, judged from their own words: struggled (an answer with an error in it, even if part was right, or stuck), partial (right as far as it went, but incomplete), applied (used it correctly), explained (explained it back), insight (went beyond what was taught). Set helped when your previous message gave, named or hinted at it, or they repeat your correction back. One call per topic per reply, summing up the exchange; a reply that notes a misconception on a topic gains nothing on it. Source "learner_said" when they tell you about their own understanding. Not for quiz or diagnostic answers. Does not end your turn.`,
  note_misconception: `Note a specific mistaken belief the learner showed (not a slip). It is shown to the learner and blocks completing the topic as mastered until resolved. Noting the same description again counts another occurrence. Does not end your turn.`,
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
  | {
      ok: true;
      command: TutorToolCommand;
      /** What parsing ignored or corrected, in words the model can read; absent when nothing. */
      adjusted?: string[];
    }
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
  const adjusted: string[] = [];
  const loosened = relax(name, loosen(ARGS[name], retire(name, input), [], adjusted), adjusted);
  const parsed = ARGS[name].safeParse(loosened);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5);
    const where = (path: (string | number)[]) => (path.length ? path.join('.') : 'arguments');
    const fields = [...new Set(issues.map((issue) => where(issue.path)))];
    return {
      ok: false,
      error: {
        code: 'invalid_arguments',
        message: issues.map((issue) => `${where(issue.path)}: ${issue.message}`).join('; '),
        hint: `Change ${fields.join(', ')} as the message says and call ${name} again. Leave out any optional field you have no value for.`,
      },
    };
  }
  const command = toCommand(name, parsed.data);
  return adjusted.length ? { ok: true, command, adjusted } : { ok: true, command };
}

// ---------------------------------------------------------------- leniency
//
// A model that fills every optional field sends placeholders (null, "", 0)
// and fields that do not apply to the call it is making. Refusing those
// teaches it nothing: it retries the identical call. So before validation,
// placeholders in optional fields are dropped, keys are matched loosely,
// numbers written as strings are read as numbers, and fields that do not
// apply are ignored and named back in the result. Only what changes a call's
// meaning is refused.

const PLACEHOLDER_WORDS = new Set(['none', 'null', 'n/a', 'na', 'undefined', 'nil']);

/**
 * Fields a tool no longer has. A model that still sends one (GPT-6 Luna sent
 * record_evidence's old setTo on every call) has it dropped without a word:
 * naming it back on every call would teach nothing.
 */
const RETIRED_FIELDS: Partial<Record<TutorToolName, readonly string[]>> = {
  record_evidence: ['setTo'],
};

function retire(name: TutorToolName, input: unknown): unknown {
  const retired = RETIRED_FIELDS[name];
  if (!retired || !isRecord(input)) return input;
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !retired.includes(camelCase(key))),
  );
}

/** Keys a model tends to use for a field the schema names differently. */
const KEY_ALIASES: Record<string, string> = { nodeId: 'topicId', node: 'topicId' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPlaceholder(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    return word === '' || PLACEHOLDER_WORDS.has(word);
  }
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.values(value).every(isPlaceholder);
  return false;
}

function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let inner = schema;
  for (;;) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) inner = inner.unwrap();
    else if (inner instanceof z.ZodDefault) inner = inner.removeDefault();
    else if (inner instanceof z.ZodEffects) inner = inner.innerType();
    else return inner;
  }
}

const camelCase = (key: string) => key.replace(/[_-]([a-z])/g, (_, c: string) => c.toUpperCase());

function schemaKey(key: string, shape: Record<string, z.ZodTypeAny>): string | undefined {
  if (key in shape) return key;
  const camel = camelCase(key);
  if (camel in shape) return camel;
  const alias = KEY_ALIASES[camel];
  return alias && alias in shape ? alias : undefined;
}

/** The generic pass: placeholders, loose keys, numbers and booleans written as strings. */
function loosen(schema: z.ZodTypeAny, value: unknown, path: string[], adjusted: string[]): unknown {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject) {
    if (!isRecord(value)) return value;
    const shape = inner.shape as Record<string, z.ZodTypeAny>;
    const out: Record<string, unknown> = {};
    // Exact keys first, so an alias never overrides the field it stands for.
    const entries = Object.entries(value).sort(
      ([a], [b]) => Number(!(a in shape)) - Number(!(b in shape)),
    );
    for (const [raw, field] of entries) {
      const key = schemaKey(raw, shape);
      if (!key) {
        if (!isPlaceholder(field))
          adjusted.push(`ignored ${[...path, raw].join('.')}: not a field of this tool`);
        continue;
      }
      if (key in out) continue;
      const fieldSchema = shape[key];
      if (fieldSchema.isOptional() && isPlaceholder(field)) continue;
      out[key] = loosen(fieldSchema, field, [...path, key], adjusted);
    }
    return out;
  }
  if (inner instanceof z.ZodArray) {
    if (!Array.isArray(value)) return value;
    return value.map((item, i) => loosen(inner.element, item, [...path, String(i)], adjusted));
  }
  if (
    inner instanceof z.ZodNumber &&
    typeof value === 'string' &&
    /^\s*-?\d+(\.\d+)?\s*$/.test(value)
  ) {
    return Number(value);
  }
  if (inner instanceof z.ZodBoolean && (value === 'true' || value === 'false')) {
    return value === 'true';
  }
  return value;
}

/** A `correct` given as a letter ("B") or as the choice's own text, read as its index. */
function correctIndex(item: unknown): unknown {
  if (!isRecord(item) || typeof item.correct !== 'string' || !Array.isArray(item.choices)) {
    return item;
  }
  const answer = item.correct.trim();
  const byText = item.choices.findIndex(
    (choice) => typeof choice === 'string' && choice.trim() === answer,
  );
  if (byText >= 0) return { ...item, correct: byText };
  if (/^[A-Fa-f]$/.test(answer)) {
    const index = answer.toUpperCase().charCodeAt(0) - 65;
    if (index < item.choices.length) return { ...item, correct: index };
  }
  return item;
}

/** Per-tool rules: fields that do not apply to the call being made are ignored. */
function relax(name: TutorToolName, value: unknown, adjusted: string[]): unknown {
  if (!isRecord(value)) return value;
  const args = { ...value };
  switch (name) {
    case 'give_quiz':
    case 'give_diagnostic':
      if (Array.isArray(args.items)) args.items = args.items.map(correctIndex);
      return args;

    case 'propose_plan':
      if (!Array.isArray(args.topics)) return args;
      args.topics = args.topics.map((topic, i) => {
        if (!isRecord(topic)) return topic;
        const next = { ...topic };
        if (Array.isArray(next.prerequisites)) {
          next.prerequisites = next.prerequisites.filter((p) => !isPlaceholder(p));
        }
        const estimate = next.startingEstimate;
        if (isRecord(estimate)) {
          let v = estimate.value;
          if (typeof v === 'number' && v > 1 && v <= 100) v = v / 100;
          if (typeof v !== 'number' || v <= 0) {
            // No value, or zero: a placeholder, not a placement.
            delete next.startingEstimate;
          } else if (v > STARTING_ESTIMATE_MAX) {
            adjusted.push(
              `topics.${i}.startingEstimate capped at ${percent(STARTING_ESTIMATE_MAX)}%: the tutor still checks a topic before it counts as ready`,
            );
            next.startingEstimate = { ...estimate, value: STARTING_ESTIMATE_MAX };
          } else {
            next.startingEstimate = { ...estimate, value: v };
          }
        }
        return next;
      });
      return args;

    case 'record_evidence': {
      if (args.weight === 0) delete args.weight;
      const sources = ['observation', 'learner_said'];
      if (args.source !== undefined && !sources.includes(String(args.source))) {
        adjusted.push(`ignored source "${String(args.source)}": recorded as "observation"`);
        delete args.source;
      }
      if (
        typeof args.weight === 'number' &&
        (args.weight > WEIGHT_MAX || args.weight < WEIGHT_MIN)
      ) {
        const clamped = Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, args.weight));
        adjusted.push(`weight clamped to ${clamped}`);
        args.weight = clamped;
      }
      return args;
    }

    default:
      return args;
  }
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

const CARD_NAMES: Partial<Record<TutorToolName, string>> = {
  ask_intake: 'Your intake questions are',
  give_diagnostic: 'Your diagnostic is',
  give_quiz: 'Your quiz is',
  propose_plan: 'Your plan proposal is',
};

/**
 * What a card's call reads when the tutor put it up without writing a word:
 * the turn gets one more round, without tools, for the introduction every
 * card needs. Only cards (tools that end the turn) have one.
 */
export function cardIntroduction(name: TutorToolName, result: ToolResult): ToolResult | undefined {
  const card = CARD_NAMES[name];
  if (!card || !TOOL_ENDS_TURN[name]) return undefined;
  return {
    ...result,
    note: `${card} on the learner's screen now, below your reply, but you have not written anything this turn. Write one or two sentences introducing it: what it is for and what to do with it. Do not call tools, and do not repeat its questions or hint at answers.`,
  };
}

export type ToolResult = Record<string, unknown>;

export function tutorToolError(error: TutorError): ToolResult {
  return { ok: false, error: error.code, message: error.message, hint: error.hint };
}

/** A result with what parsing ignored or corrected, so the model knows what did not count. */
export function withAdjustments(result: ToolResult, adjusted: readonly string[] | undefined) {
  return adjusted?.length ? { ...result, adjusted: [...adjusted] } : result;
}

/** Why an observation moved nothing, for the tutor to learn from. */
function noGainReason(before: TutorState, event: TutorEventOf<'evidence_recorded'>): string {
  if (replyRecord(before, event.messageId)?.misconceptions.includes(event.nodeId)) {
    return `No gain: you noted a misconception on ${event.nodeId} in this reply, and an answer that shows a misconception earns nothing on its topic. Record a wrong answer as struggled.`;
  }
  return 'No gain: a partly right answer you led them to shows nothing of their own yet.';
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
        ...(proposal?.startingEstimates
          ? {
              startingEstimates: Object.fromEntries(
                Object.entries(proposal.startingEstimates).map(([id, e]) => [id, percent(e.value)]),
              ),
            }
          : {}),
        note: 'The learner sees the proposal and will approve or decline it.',
      };
    }
    case 'record_evidence': {
      if (event?.type !== 'evidence_recorded') return { ok: true };
      const nodeId = event.nodeId;
      return {
        ok: true,
        ...topicSummary(after, nodeId),
        was: percent(confidenceOf(before, nodeId)),
        ...(event.weight === 0 ? { note: noGainReason(before, event) } : {}),
      };
    }
    case 'note_misconception': {
      if (event?.type !== 'misconception_noted') return { ok: true };
      const m = after.mastery[event.nodeId]?.misconceptions.find(
        (x) => x.id === event.misconceptionId,
      );
      const takenBack = events.some((e) => e.type === 'evidence_recorded');
      return {
        ok: true,
        topic: event.nodeId,
        misconceptionId: event.misconceptionId,
        occurrences: m?.occurrences ?? 1,
        ...(takenBack
          ? {
              mastery: percent(confidenceOf(after, event.nodeId)),
              was: percent(confidenceOf(before, event.nodeId)),
              note: `The gain you recorded on ${event.nodeId} earlier in this reply was taken back: an answer that shows a misconception earns nothing on its topic. Record a wrong answer as struggled.`,
            }
          : {}),
      };
    }
    case 'resolve_misconception':
      return event?.type === 'misconception_resolved'
        ? { ok: true, topic: event.nodeId, resolved: event.misconceptionId }
        : { ok: true, note: 'It was already resolved; nothing changed.' };
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
            : 'The learner now sees a chapter break and chooses what comes next: go on, more practice, or change the path. Close the topic with a short line and end your turn; do not start the next topic in this reply.',
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
        ...(events.length ? {} : { note: 'It was already in progress; nothing changed.' }),
      };
    }
  }
}
