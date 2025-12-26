import type { ComponentType } from 'react';
import { ChatBubbleLeftRightIcon, CodeBracketIcon, SparklesIcon } from '@heroicons/react/24/outline';

type FreeCuratedModel = {
  id: string;
  name: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
};

/**
 * Free model IDs available on OpenRouter.
 * These models can be used without cost.
 *
 * To find free models on OpenRouter:
 * 1. Go to https://openrouter.ai/models
 * 2. Filter by "Free" pricing
 * 3. Add model IDs here (format: provider/model-name:free)
 */
export const FREE_MODEL_IDS: string[] = [
  'xiaomi/mimo-v2-flash:free',
  'allenai/olmo-3.1-32b-think:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'mistralai/devstral-2512:free',
];

/**
 * Default model for free tier users.
 * Make sure this ID is in FREE_MODEL_IDS.
 */
export const DEFAULT_FREE_MODEL: FreeCuratedModel = {
  id: 'xiaomi/mimo-v2-flash:free',
  name: 'Mimo V2 Flash',
  description: 'Fast multimodal model with vision capabilities',
  Icon: ChatBubbleLeftRightIcon,
};

/**
 * Curated free models to show in the model picker.
 * These appear in the "Recommended" section for free tier users.
 */
export const FREE_CURATED_MODELS: FreeCuratedModel[] = [
  DEFAULT_FREE_MODEL,
  {
    id: 'allenai/olmo-3.1-32b-think:free',
    name: 'OLMo 3.1 32B Think',
    description: 'Strong reasoning with extended thinking capabilities',
    Icon: SparklesIcon,
  },
  {
    id: 'nvidia/nemotron-3-nano-30b-a3b:free',
    name: 'Nemotron 3 Nano',
    description: 'Efficient 30B model optimized for fast responses',
    Icon: ChatBubbleLeftRightIcon,
  },
  {
    id: 'mistralai/devstral-2512:free',
    name: 'Devstral',
    description: 'Specialized for code generation and programming tasks',
    Icon: CodeBracketIcon,
  },
];

export const DEFAULT_FREE_MODEL_ID = DEFAULT_FREE_MODEL.id;

/**
 * Check if a model ID is a free model.
 */
export function isFreeModel(modelId: string): boolean {
  return FREE_MODEL_IDS.includes(modelId);
}

export type { FreeCuratedModel };
