import type { Chat } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type { AccessTier } from '@/lib/auth/types';
import { isTutorForcedForTier } from '@/lib/auth/tierFeatures';

export const isTutorRuntimeEnabled = (ui: UiSnapshot, chat: Chat, tier?: AccessTier): boolean => {
  // Study tier always has tutor mode forced
  if (tier && isTutorForcedForTier(tier)) return true;

  const tutorGloballyEnabled = !!ui.flags.experimentalTutor;
  const forceTutorMode = !!(ui.tutor.forceMode ?? false);
  return tutorGloballyEnabled && (forceTutorMode || !!chat.settings.features.tutor.enabled);
};

export const selectTutorDefaultModelId = (
  ui: UiSnapshot,
  chat: Chat,
  fallback?: string,
): string | undefined =>
  ui.tutor.defaultModelId || chat.settings.features.tutor.defaultModelId || fallback;

export const enforceZdrGate = async (
  ui: UiSnapshot,
  modelIds: Iterable<string>,
  guard: (modelId: string) => Promise<boolean>,
): Promise<boolean> => {
  if (!ui.zdrOnly) return true;
  for (const id of modelIds) {
    if (!id) continue;
    const allowed = await guard(id);
    if (!allowed) return false;
  }
  return true;
};
