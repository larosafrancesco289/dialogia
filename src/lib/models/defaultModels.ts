// Module: models/defaultModels
// Responsibility: Which concrete model new chats and the tutor start with,
// given what the user's providers serve right now.

import {
  DEFAULT_MODEL_PREFERENCE,
  DEFAULT_TUTOR_MODEL,
  TUTOR_MODEL_PREFERENCE,
} from '@/data/curatedModels';
import { resolveFirstAvailableModelId } from '@/lib/models/dynamicDefaults';
import { isBuiltInEndpointId } from '@/lib/transport/endpoints';
import type { ModelDescriptor, ReasoningEffort } from '@/lib/types';

/** Claude Haiku, on OpenRouter or a Claude API key; GPT Luna where Haiku is not served. */
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

// A model by name alone: "anthropic/claude-haiku-5.5", its Claude API id
// "anthropic-direct/claude-haiku-5-5", a dated or ":variant" id all read alike.
const bareModelName = (id: string) =>
  id
    .replace(/^[^/]*\//, '')
    .replace(/:.*$/, '')
    .replace(/-\d{8}$/, '')
    .replace(/\./g, '-');

/**
 * The effort a tutor turn runs at when the learner chose none: the one the
 * tutor's pinned model is tuned at, on any provider that serves it; otherwise
 * the model's own default.
 */
export function tutorDefaultEffort(modelId: string): ReasoningEffort | undefined {
  return bareModelName(modelId) === bareModelName(DEFAULT_TUTOR_MODEL.id)
    ? DEFAULT_TUTOR_MODEL.effort
    : undefined;
}
