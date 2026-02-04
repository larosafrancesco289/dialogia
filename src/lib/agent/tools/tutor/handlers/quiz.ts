import type { MessageTutor } from '@/lib/types';
import type { TutorToolHandler } from '@/lib/agent/tools/tutor/types';
import { normalizeTutorQuizPayload, withContentReset } from '@/lib/agent/tools/tutor/shared';
import { parseSchema } from '@/lib/schemas/parse';
import { UnifiedQuizToolSchema, type UnifiedQuizInput } from '@/lib/tools/definitions/tutor/quiz';

type UnifiedQuizArgs = {
  type: 'mcq' | 'fill_blank' | 'open_ended';
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

export const quizHandler: TutorToolHandler<UnifiedQuizArgs> = {
  parseArgs(input: unknown) {
    const parsed = parseSchema(UnifiedQuizToolSchema, input);
    if (!parsed.ok) return null;
    const data = parsed.data as UnifiedQuizInput;
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
