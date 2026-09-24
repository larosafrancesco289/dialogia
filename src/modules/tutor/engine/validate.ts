// Module: tutor engine validate
// Responsibility: the payload check for a stored or imported event. A row that fails it is dropped, never folded.

import { z } from 'zod';
import type { TutorEvent, TutorEventType } from '@/modules/tutor/engine/events';
import { MASTERY_PRIOR } from '@/modules/tutor/engine/rules';

const id = z.string().min(1);

const intakeQuestion = z
  .object({
    id,
    question: z.string(),
    category: z.string().optional(),
    allowMultiple: z.boolean().optional(),
    options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
  })
  .passthrough();

const quizItem = z
  .object({
    id,
    question: z.string(),
    choices: z.array(z.string()),
    correct: z.number().int(),
    explanation: z.string().optional(),
  })
  .passthrough();

const diagnosticItem = quizItem.extend({
  correct: z.number().int().optional(),
  nodeId: z.string().optional(),
});

const planNode = z
  .object({
    id,
    name: z.string(),
    objectives: z.array(z.string()),
    prerequisites: z.array(z.string()),
    status: z.enum(['not_started', 'in_progress', 'completed']),
  })
  .passthrough();

const plan = z
  .object({
    goal: z.string(),
    generatedAt: z.number().catch(0),
    updatedAt: z.number().catch(0),
    version: z.number().catch(1),
    nodes: z.array(planNode),
  })
  .passthrough();

/**
 * The entries of an array that parse; the rest are dropped one by one, so a
 * single bad entry costs only itself. Anything that is not an array is empty.
 */
const eachValid = <T extends z.ZodTypeAny>(entry: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = entry.safeParse(item);
        return parsed.success ? [parsed.data as z.output<T>] : [];
      }),
    );

/** Like `eachValid`, for a record keyed by id. */
const eachValidIn = <T extends z.ZodTypeAny>(entry: T) =>
  z
    .record(z.unknown())
    .catch({})
    .transform((record) => {
      const out: Record<string, z.output<T>> = {};
      for (const [key, value] of Object.entries(record)) {
        const parsed = entry.safeParse(value);
        if (parsed.success) out[key] = parsed.data as z.output<T>;
      }
      return out;
    });

// Pre-rebuild learner models were never range-checked, and a JSON backup
// turns a stored NaN into null. Each topic is repaired where it can be and
// dropped only when it is not a topic at all, so one bad number never costs
// the learner the rest of their model.
const misconception = z
  .object({
    id,
    description: z.string(),
    firstObserved: z.number().catch(0),
    occurrences: z.number().catch(1),
    resolved: z.boolean().catch(false),
  })
  .passthrough();

const evidenceEntry = z
  .object({ weight: z.number().finite(), details: z.string().catch('') })
  .passthrough();

const mastery = z
  .object({
    nodeId: z.string().optional(),
    confidence: z.number().finite().catch(MASTERY_PRIOR),
    interactions: z.number().catch(0),
    lastInteraction: z.number().catch(0),
    evidence: eachValid(evidenceEntry),
    misconceptions: eachValid(misconception),
  })
  .passthrough();

const learnerModel = z.object({ mastery: eachValidIn(mastery) }).passthrough();

const PAYLOADS: Record<TutorEventType, z.ZodTypeAny> = {
  legacy_imported: z.object({
    plan: plan.optional(),
    learnerModel: learnerModel.optional(),
  }),
  intake_asked: z.object({
    intakeId: id,
    title: z.string().optional(),
    questions: z.array(intakeQuestion),
  }),
  intake_answered: z.object({ intakeId: id, responses: z.record(z.array(z.string())) }),
  diagnostic_given: z.object({
    diagnosticId: id,
    topic: z.string(),
    items: z.array(diagnosticItem),
  }),
  diagnostic_answered: z.object({ diagnosticId: id, answers: z.record(z.number().int()) }),
  plan_proposed: z.object({
    proposalId: id,
    plan,
    rationale: z.string().optional(),
    revision: z.boolean(),
    startingEstimates: z.record(z.object({ value: z.number(), reason: z.string() })).optional(),
  }),
  plan_approved: z.object({ proposalId: id }),
  plan_declined: z.object({ proposalId: id, feedback: z.string().optional() }),
  topic_started: z.object({ nodeId: id }),
  topic_completed: z.object({
    nodeId: id,
    how: z.enum(['mastered', 'known', 'skipped']),
    note: z.string().optional(),
  }),
  topic_reopened: z.object({ nodeId: id }),
  quiz_given: z.object({
    quizId: id,
    nodeId: z.string(),
    title: z.string().optional(),
    items: z.array(quizItem),
  }),
  quiz_answered: z.object({
    quizId: id,
    itemId: id,
    choice: z.number().int(),
    correct: z.boolean(),
  }),
  evidence_recorded: z.object({
    nodeId: id,
    source: z.enum(['quiz', 'diagnostic', 'observation', 'learner_said', 'learner', 'placement']),
    kind: z.string().min(1),
    weight: z.number().optional(),
    setTo: z.number().optional(),
    note: z.string(),
    ref: z
      .object({
        quizId: z.string().optional(),
        diagnosticId: z.string().optional(),
        itemId: z.string().optional(),
        eventId: z.string().optional(),
      })
      .optional(),
  }),
  misconception_noted: z.object({ nodeId: id, misconceptionId: id, description: z.string() }),
  misconception_resolved: z.object({
    nodeId: id,
    misconceptionId: id,
    note: z.string().optional(),
  }),
  review_flagged: z.object({ nodeId: id, flagged: z.boolean() }),
  card_dismissed: z.object({ card: z.enum(['intake', 'diagnostic', 'quiz']), cardId: id }),
  reply_retracted: z.object({ replyId: id }),
  proposal_imported: z.object({
    proposalId: id,
    plan,
    rationale: z.string().optional(),
    status: z.enum(['approved', 'declined', 'replaced']),
  }),
};

const envelope = z.object({
  id,
  chatId: id,
  seq: z.number().int().positive(),
  at: z.number(),
  by: z.enum(['tutor', 'learner', 'system']),
  messageId: z.string().min(1).optional(),
});

function isEventType(type: unknown): type is TutorEventType {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(PAYLOADS, type);
}

/**
 * The event, when its envelope and its type's payload are well-formed; else
 * undefined. Unknown types (a newer build's events) are dropped too, since
 * the reducer has no way to fold them.
 */
export function parseTutorEvent(raw: unknown): TutorEvent | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const type = (raw as { type?: unknown }).type;
  if (!isEventType(type)) return undefined;
  const base = envelope.safeParse(raw);
  const payload = PAYLOADS[type].safeParse(raw);
  if (!base.success || !payload.success) return undefined;
  return { ...base.data, ...payload.data, type } as TutorEvent;
}
