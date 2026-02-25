import type { MessageTutor } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizeTutorQuizPayload, withContentReset } from '@/lib/agent/tools/tutor/shared';
import { parseSchema } from '@/lib/schemas/parse';
import { UnifiedQuizToolSchema, type UnifiedQuizInput } from '@/lib/tools/definitions/tutor/quiz';

type QuizType = 'mcq' | 'fill_blank' | 'open_ended';

type UnifiedQuizArgs = {
  type: QuizType;
  items: Array<{ id: string; [key: string]: unknown }>;
  title?: string;
  nodeId?: string;
};

const TYPE_TO_MAP_KEY: Record<
  UnifiedQuizArgs['type'],
  keyof Pick<MessageTutor, 'mcq' | 'fillBlank' | 'openEnded'>
> = {
  mcq: 'mcq',
  fill_blank: 'fillBlank',
  open_ended: 'openEnded',
};

const asTrimmedString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const normalizeQuizType = (value: unknown): QuizType | undefined => {
  const raw = asTrimmedString(value)?.toLowerCase();
  if (!raw) return undefined;
  if (raw === 'mcq' || raw === 'multiple_choice' || raw === 'multiple-choice') return 'mcq';
  if (raw === 'fill_blank' || raw === 'fill-in-the-blank' || raw === 'fillblank') {
    return 'fill_blank';
  }
  if (raw === 'open_ended' || raw === 'open-ended' || raw === 'open') return 'open_ended';
  return undefined;
};

const normalizeItemForType = (
  type: QuizType,
  item: Record<string, unknown>,
): Record<string, unknown> => {
  const normalized: Record<string, unknown> = { ...item };
  if (!asTrimmedString(normalized.prompt)) {
    const fallbackPrompt =
      asTrimmedString(normalized.question) ||
      asTrimmedString(normalized.questionText) ||
      asTrimmedString(normalized.question_text) ||
      asTrimmedString(normalized.text);
    if (fallbackPrompt) normalized.prompt = fallbackPrompt;
  }
  if (type === 'mcq') {
    if (!Array.isArray(normalized.choices) && Array.isArray(normalized.options)) {
      normalized.choices = normalized.options;
    }
    if (typeof normalized.correct !== 'number' && typeof normalized.correctAnswer === 'number') {
      normalized.correct = normalized.correctAnswer;
    }
    if (!asTrimmedString(normalized.question) && asTrimmedString(normalized.prompt)) {
      normalized.question = normalized.prompt;
    }
  } else {
    if (
      type === 'fill_blank' &&
      !asTrimmedString(normalized.answer) &&
      asTrimmedString(normalized.correctAnswer)
    ) {
      normalized.answer = normalized.correctAnswer;
    }
    if (
      type === 'fill_blank' &&
      !asTrimmedString(normalized.answer) &&
      typeof normalized.correct === 'string'
    ) {
      normalized.answer = normalized.correct;
    }
    if (
      type === 'fill_blank' &&
      !asTrimmedString(normalized.answer) &&
      typeof normalized.correct === 'number' &&
      Array.isArray(normalized.choices)
    ) {
      const choices = normalized.choices as unknown[];
      const candidate = choices[normalized.correct];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        normalized.answer = candidate;
      }
    }
    if (type === 'open_ended') {
      const sample =
        asTrimmedString(normalized.sample_answer) || asTrimmedString(normalized.sampleAnswer);
      if (sample && !asTrimmedString(normalized.sample_answer)) {
        normalized.sample_answer = sample;
      }
    }
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
            answer: record.answer,
            aliases: record.aliases,
            sample_answer: record.sample_answer,
            rubric: record.rubric,
            explanation: record.explanation,
            topic: record.topic,
            skill: record.skill,
            difficulty: record.difficulty,
          },
        ];

  const normalizedItems = items
    .map((entry) => (entry && typeof entry === 'object' ? normalizeItemForType(type, entry) : null))
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
      type: data.type,
      items: normalized.items,
      title,
      nodeId,
    };
  },

  async apply(ctx, args) {
    const { type, items, title } = args;
    const mapKey = TYPE_TO_MAP_KEY[type];

    await ctx.applyTutorPatch((prev) =>
      withContentReset(mapKey, {
        [mapKey]: items,
        title:
          title ||
          (typeof prev.title === 'string' && prev.title.trim().length > 0 ? prev.title : undefined),
      }),
    );

    const payload = title ? { type, items, title } : { type, items };
    return { handled: true, usedContent: true, payload: JSON.stringify(payload) };
  },
};
