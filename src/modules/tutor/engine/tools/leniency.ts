// Module: tutor engine tool leniency
// Responsibility: loosening a tool call's arguments before they are validated.
//
// A model that fills every optional field sends placeholders (null, "", 0)
// and fields that do not apply to the call it is making. Refusing those
// teaches it nothing: it retries the identical call. So before validation,
// placeholders in optional fields are dropped, keys are matched loosely,
// numbers written as strings are read as numbers, and fields that do not
// apply are ignored and named back in the result. Only what changes a call's
// meaning is refused.

import { z } from 'zod';
import { isRecord } from '@/lib/utils/guards';
import type { TutorToolName } from '@/modules/tutor/engine/commands';
import {
  STARTING_ESTIMATE_MAX,
  WEIGHT_MAX,
  WEIGHT_MIN,
  percent,
} from '@/modules/tutor/engine/rules';

const PLACEHOLDER_WORDS = new Set(['none', 'null', 'n/a', 'na', 'undefined', 'nil']);

/**
 * Fields a tool no longer has. A model that still sends one (GPT-6 Luna sent
 * record_evidence's old setTo on every call) has it dropped without a word:
 * naming it back on every call would teach nothing.
 */
const RETIRED_FIELDS: Partial<Record<TutorToolName, readonly string[]>> = {
  record_evidence: ['setTo'],
};

export function retire(name: TutorToolName, input: unknown): unknown {
  const retired = RETIRED_FIELDS[name];
  if (!retired || !isRecord(input)) return input;
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !retired.includes(camelCase(key))),
  );
}

/** Keys a model tends to use for a field the schema names differently. */
const KEY_ALIASES: Record<string, string> = { nodeId: 'topicId', node: 'topicId' };

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
export function loosen(
  schema: z.ZodTypeAny,
  value: unknown,
  path: string[],
  adjusted: string[],
): unknown {
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
export function relax(name: TutorToolName, value: unknown, adjusted: string[]): unknown {
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
