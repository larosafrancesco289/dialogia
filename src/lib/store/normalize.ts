import type { Chat } from '@/lib/types';
import type { UIState } from '@/lib/store/types';

export function normalizeParallelModels(
  baseModelId: string | undefined,
  list?: string[],
): string[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (baseModelId && trimmed === baseModelId) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

type ApplyTutorDefaultsArgs = {
  ui?: Pick<UIState, 'tutorDefaultModelId'> | Partial<UIState>;
  chat: Pick<Chat, 'settings'>;
  fallbackDefaultModelId: string;
};

export function applyTutorDefaults({
  ui,
  chat,
  fallbackDefaultModelId,
}: ApplyTutorDefaultsArgs): { nextSettings: Chat['settings']; changed: boolean; defaultModelId: string } {
  const currentSettings = chat.settings ?? ({} as Chat['settings']);
  const next: Chat['settings'] = { ...currentSettings };
  const tutorDefaultModelId =
    (ui?.tutorDefaultModelId as string | undefined) ||
    (currentSettings.tutor_default_model as string | undefined) ||
    fallbackDefaultModelId;

  let changed = false;

  if (next.model !== tutorDefaultModelId) {
    next.model = tutorDefaultModelId;
    changed = true;
  }

  if (next.tutor_default_model !== tutorDefaultModelId) {
    next.tutor_default_model = tutorDefaultModelId;
    changed = true;
  }

  if (next.enableLearnerModel !== true) {
    next.enableLearnerModel = true;
    changed = true;
  }

  return {
    nextSettings: next,
    changed,
    defaultModelId: tutorDefaultModelId,
  };
}
