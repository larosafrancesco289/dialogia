import type { Chat } from '@/lib/types';
import type { UIState } from '@/lib/store/types';

export const isTutorRuntimeEnabled = (ui: UIState, chat: Chat): boolean => {
  const tutorGloballyEnabled = !!ui.flags.experimentalTutor;
  const forceTutorMode = !!(ui.tutor.forceMode ?? false);
  return tutorGloballyEnabled && (forceTutorMode || !!chat.settings.tutor_mode);
};

export const selectTutorDefaultModelId = (
  ui: UIState,
  chat: Chat,
  fallback?: string,
): string | undefined =>
  ui.tutor.defaultModelId || chat.settings.tutor_default_model || fallback;

export const enforceZdrGate = async (
  ui: UIState,
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

export const getRoutePreference = (ui: UIState) => ui.routePreference;
