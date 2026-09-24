// Module: settings/patch
// Responsibility: Apply an in-chat settings patch and derive the defaults it makes sticky.

import type { ChatDefaults, ChatSettings, ChatSettingsPatch } from '@/lib/types';
import { DEFAULT_DISPLAY_PREFERENCES } from '@/lib/settings/chatDefaults';

const FALLBACK_FEATURES = {
  search: { enabled: false, provider: 'openrouter' as const },
  tutor: { enabled: false },
};

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

/** Merges a patch one level into each settings group, filling groups old records lack. */
export function mergeChatSettingsPatch(base: ChatSettings, patch: ChatSettingsPatch): ChatSettings {
  const baseFeatures = base.features ?? FALLBACK_FEATURES;
  return {
    ...base,
    ...patch,
    generation: { ...(base.generation ?? {}), ...(patch.generation ?? {}) },
    ui: { ...(base.ui ?? DEFAULT_DISPLAY_PREFERENCES), ...(patch.ui ?? {}) },
    features: {
      ...baseFeatures,
      search: {
        ...(baseFeatures.search ?? FALLBACK_FEATURES.search),
        ...(patch.features?.search ?? {}),
      },
      tutor: {
        ...(baseFeatures.tutor ?? FALLBACK_FEATURES.tutor),
        ...(patch.features?.tutor ?? {}),
      },
    },
  };
}

/**
 * Switching model returns reasoning to the new model's own default: an effort
 * chosen for the previous model must not silently carry over to a model with
 * different levels and defaults. A patch that sets reasoning itself keeps it.
 */
export function resetReasoningOnModelChange(
  previousModelId: string,
  patch: ChatSettingsPatch,
  merged: ChatSettings,
): { settings: ChatSettings; reset: boolean } {
  const modelChanged =
    hasOwn(patch, 'modelId') &&
    typeof patch.modelId === 'string' &&
    patch.modelId !== previousModelId;
  const patchSetsReasoning =
    !!patch.generation &&
    (hasOwn(patch.generation, 'reasoningEffort') || hasOwn(patch.generation, 'reasoningTokens'));
  if (!modelChanged || patchSetsReasoning) return { settings: merged, reset: false };
  return {
    settings: {
      ...merged,
      generation: { ...merged.generation, reasoningEffort: undefined, reasoningTokens: undefined },
    },
    reset: true,
  };
}

/**
 * In-chat changes to model and reasoning become the sticky defaults for future
 * chats, so a new chat continues where the user left off. Search intentionally
 * does not stick: tool toggles reset per chat so a research session doesn't
 * quietly add search cost to every future message. Tutor chats are excluded:
 * their model is managed by tutor defaults and must not leak into regular chats.
 *
 * `next` is the chat's settings after the patch; `reasoningReset` says the
 * model switch dropped the explicit effort, which drops the sticky one too so
 * future chats follow the new model's default. Undefined when nothing sticks.
 */
export function stickyDefaultsFromPatch(
  patch: ChatSettingsPatch,
  next: ChatSettings,
  reasoningReset: boolean,
): ChatDefaults | undefined {
  const generation = patch.generation
    ? {
        ...(hasOwn(patch.generation, 'reasoningEffort')
          ? { reasoningEffort: next.generation.reasoningEffort }
          : {}),
        ...(hasOwn(patch.generation, 'reasoningTokens')
          ? { reasoningTokens: next.generation.reasoningTokens }
          : {}),
      }
    : reasoningReset
      ? { reasoningEffort: undefined, reasoningTokens: undefined }
      : {};
  const isTutorChat = next.features.tutor?.enabled;
  const sticky: ChatDefaults = {
    ...(!isTutorChat && hasOwn(patch, 'modelId') ? { modelId: next.modelId } : {}),
    ...(Object.keys(generation).length ? { generation } : {}),
  };
  return Object.keys(sticky).length ? sticky : undefined;
}
