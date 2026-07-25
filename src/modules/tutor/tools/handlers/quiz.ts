import type { TutorMCQItem } from '@/lib/types';
import type { TutorToolHandler } from '@/modules/tutor/tools/types';
import { normalizeTutorQuizPayload, withContentReset } from '@/modules/tutor/tools/shared';
import { parseSchema } from '@/lib/schemas/parse';
import {
  UnifiedQuizToolSchema,
  type UnifiedQuizInput,
} from '@/modules/tutor/tools/definitions/quiz';

type UnifiedQuizArgs = {
  type: 'mcq';
  items: Array<{ id: string; [key: string]: unknown }>;
  title?: string;
  nodeId?: string;
};

const asTrimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizeQuizType = (value: unknown): 'mcq' | undefined => {
  const raw = asTrimmedString(value)?.toLowerCase();
  if (!raw) return undefined;
  if (raw === 'mcq' || raw === 'multiple_choice' || raw === 'multiple-choice') return 'mcq';
  return undefined;
};

const normalizeItemForMcq = (item: Record<string, unknown>): Record<string, unknown> => {
  const normalized: Record<string, unknown> = { ...item };
  if (!Array.isArray(normalized.choices) && Array.isArray(normalized.options)) {
    normalized.choices = normalized.options;
  }
  if (typeof normalized.correct !== 'number' && typeof normalized.correctAnswer === 'number') {
    normalized.correct = normalized.correctAnswer;
  }
  if (!asTrimmedString(normalized.question)) {
    const fallback =
      asTrimmedString(normalized.prompt) ||
      asTrimmedString(normalized.questionText) ||
      asTrimmedString(normalized.question_text) ||
      asTrimmedString(normalized.text);
    if (fallback) normalized.question = fallback;
  }
  return normalized;
};

const coerceLegacyQuizInput = (input: unknown): Record<string, unknown> | null => {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const type = normalizeQuizType(record.type ?? record.questionType ?? record.quizType);
  if (!type) return null;

  const sourceItems = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.questions)
      ? record.questions
      : [];
  const items =
    sourceItems.length > 0
      ? sourceItems
      : [
          {
            id: record.id,
            question: record.question,
            prompt: record.prompt,
            options: record.options,
            choices: record.choices,
            correct: record.correct,
            correctAnswer: record.correctAnswer,
            explanation: record.explanation,
            topic: record.topic,
            skill: record.skill,
            difficulty: record.difficulty,
          },
        ];

  const normalizedItems = items
    .map((entry) => (entry && typeof entry === 'object' ? normalizeItemForMcq(entry) : null))
    .filter(Boolean) as Array<Record<string, unknown>>;
  if (normalizedItems.length === 0) return null;

  return {
    type,
    title: asTrimmedString(record.title ?? record.quizTitle),
    nodeId: asTrimmedString(record.nodeId ?? record.topicId),
    items: normalizedItems,
  };
};

const parseQuizInput = (input: unknown): UnifiedQuizInput | null => {
  const direct = parseSchema(UnifiedQuizToolSchema, input);
  if (direct.ok) return direct.data as UnifiedQuizInput;
  const legacy = coerceLegacyQuizInput(input);
  if (!legacy) return null;
  const reparsed = parseSchema(UnifiedQuizToolSchema, legacy);
  return reparsed.ok ? (reparsed.data as UnifiedQuizInput) : null;
};

export const quizHandler: TutorToolHandler<UnifiedQuizArgs> = {
  parseArgs(input: unknown) {
    const data = parseQuizInput(input);
    if (!data) return null;
    const normalized = normalizeTutorQuizPayload(data);
    if (!normalized) return null;
    const title = typeof data.title === 'string' ? data.title.trim() : undefined;
    const nodeId = typeof data.nodeId === 'string' ? data.nodeId.trim() : undefined;
    return {
      type: 'mcq',
      items: normalized.items,
      title,
      nodeId,
    };
  },

  async apply(ctx, args) {
    const { items, title } = args;

    await ctx.applyTutorPatch((prev) =>
      withContentReset('mcq', {
        mcq: items as unknown as TutorMCQItem[],
        title:
          title ||
          (typeof prev.title === 'string' && prev.title.trim().length > 0 ? prev.title : undefined),
      }),
    );

    const payload = title ? { type: 'mcq', items, title } : { type: 'mcq', items };
    return { handled: true, usedContent: true, payload: JSON.stringify(payload) };
  },
};
