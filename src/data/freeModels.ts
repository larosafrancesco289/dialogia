import type { ComponentType } from 'react';
import { SparklesIcon } from '@heroicons/react/24/outline';

type FreeCuratedModel = {
  id: string;
  name: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
};

/**
 * The dynamic free model endpoint that automatically routes
 * to the best available free model on OpenRouter.
 */
export const OPENROUTER_FREE_MODEL_ID = 'openrouter/free';

/**
 * Default model for free tier users.
 * Uses OpenRouter's dynamic free routing.
 */
export const DEFAULT_FREE_MODEL: FreeCuratedModel = {
  id: OPENROUTER_FREE_MODEL_ID,
  name: 'Auto (Free)',
  description: 'Automatically routes to the best available free model',
  Icon: SparklesIcon,
};

export const DEFAULT_FREE_MODEL_ID = OPENROUTER_FREE_MODEL_ID;

/**
 * Curated free models to show in the model picker.
 * Shows only the auto-routing model for free tier users.
 */
export const FREE_CURATED_MODELS: FreeCuratedModel[] = [DEFAULT_FREE_MODEL];

/**
 * Default tutor model for free tier users.
 * Also uses the dynamic free routing endpoint.
 */
export const DEFAULT_FREE_TUTOR_MODEL_ID = OPENROUTER_FREE_MODEL_ID;

/**
 * Check if a model ID is a free model.
 * Returns true for the openrouter/free endpoint or any model ending in :free.
 */
export function isFreeModel(modelId: string): boolean {
  if (modelId === OPENROUTER_FREE_MODEL_ID) return true;
  return modelId.endsWith(':free');
}

export type { FreeCuratedModel };
