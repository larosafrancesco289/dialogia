import { TIER_COOKIE_NAME } from './shared';
import { readRequestCookie } from '@/lib/auth/cookies.server';
import type { AccessTier } from './types';
import { canUseAllModelsForTier, isModelAllowedForTier } from './tierFeatures';
import { parseAccessTier } from './tier.shared';
import { logger } from '@/lib/logger';
import { getServerOpenRouterFreeKey, requireServerOpenRouterKey } from '@/lib/env/server';

/**
 * Get the current access tier from the request cookies.
 * Defaults to 'free' if no tier cookie is present.
 */
export function getServerTier(req: Request): AccessTier {
  return parseAccessTier(readRequestCookie(req, TIER_COOKIE_NAME));
}

/**
 * Get the OpenRouter API key based on the current tier.
 * - Free tier: uses OPENROUTER_FREE_API_KEY
 * - Other tiers: uses OPENROUTER_API_KEY
 *
 * Falls back to OPENROUTER_API_KEY if free key is not configured.
 */
export function getOpenRouterApiKeyForTier(tier: AccessTier): string {
  const allowAllModels = canUseAllModelsForTier(tier);

  if (!allowAllModels) {
    const freeKey = getServerOpenRouterFreeKey();
    if (freeKey) {
      return freeKey;
    }
    // Fall back to main key if free key not configured
    logger.warn('[tierApiKey] OPENROUTER_FREE_API_KEY not set, falling back to main key');
  }

  return requireServerOpenRouterKey();
}

/**
 * Check if the current tier is allowed to use a specific model.
 * Free tier can only use models from the FREE_MODEL_IDS list.
 */
export function canUseTierModel(modelId: string, tier: AccessTier): boolean {
  // Paid tiers can use any model
  if (canUseAllModelsForTier(tier)) {
    return true;
  }

  return isModelAllowedForTier(tier, modelId);
}
