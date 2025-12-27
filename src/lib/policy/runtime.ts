import type { Chat } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';

export const isTutorRuntimeEnabled = (ui: UiSnapshot, chat: Chat): boolean => {
  const tutorGloballyEnabled = !!ui.flags.experimentalTutor;
  const forceTutorMode = !!(ui.tutor.forceMode ?? false);
  return tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);
};

export const selectTutorDefaultModelId = (
  ui: UiSnapshot,
  chat: Chat,
  fallback?: string,
): string | undefined => ui.tutor.defaultModelId || chat.settings.tutor_default_model || fallback;

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

export const getRoutePreference = (ui: UiSnapshot) => ui.routePreference;
