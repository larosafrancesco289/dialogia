// Module: models/defaultModels
// Responsibility: Which concrete model new chats and the tutor start with,
// given what the user's providers serve right now.

import { DEFAULT_MODEL_PREFERENCE, TUTOR_MODEL_PREFERENCE } from '@/data/curatedModels';
import { resolveFirstAvailableModelId } from '@/lib/models/dynamicDefaults';
import { isBuiltInEndpointId } from '@/lib/transport/endpoints';
import type { ModelDescriptor } from '@/lib/types';

/** GPT Luna where OpenRouter serves it, Claude Opus on a Claude API key alone. */
export function resolveDefaultModelId(models: ModelDescriptor[]): string {
  return resolveFirstAvailableModelId(DEFAULT_MODEL_PREFERENCE, models, isBuiltInEndpointId);
}

/**
 * The tutor's model: the one chosen for it, else its pinned default, else GPT
 * Luna's newest, else what new chats start with. Never a model that is gone.
 */
export function resolveTutorModelId(chosen: string | undefined, models: ModelDescriptor[]): string {
  const preference = chosen ? [chosen, ...TUTOR_MODEL_PREFERENCE] : TUTOR_MODEL_PREFERENCE;
  return resolveFirstAvailableModelId(preference, models, isBuiltInEndpointId);
}
