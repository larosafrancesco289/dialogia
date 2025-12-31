import 'server-only';
import { cookies } from 'next/headers';
import { TIER_COOKIE_NAME } from './shared';
import type { AccessTier } from './types';
import { canUseAllModelsForTier } from './tierPolicy';
import { logger } from '@/lib/logger';
import { getServerOpenRouterFreeKey, requireServerOpenRouterKey } from '@/lib/env/server';

/**
 * Get the current access tier from cookies (server-side).
 * Defaults to 'free' if no tier cookie is present.
 */
export async function getServerTier(): Promise<AccessTier> {
  try {
    const cookieStore = await cookies();
    const tierCookie = cookieStore.get(TIER_COOKIE_NAME);
    const tier = tierCookie?.value;
    if (tier === 'developer' || tier === 'individual' || tier === 'free' || tier === 'study') {
      return tier;
    }
    return 'free';
  } catch {
    return 'free';
  }
}

/**
 * Get the OpenRouter API key based on the current tier.
 * - Free tier: uses OPENROUTER_FREE_API_KEY
 * - Other tiers: uses OPENROUTER_API_KEY
 *
 * Falls back to OPENROUTER_API_KEY if free key is not configured.
 */
export async function getOpenRouterApiKeyForTier(): Promise<string> {
  const tier = await getServerTier();
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
export async function canUseTierModel(modelId: string): Promise<boolean> {
  const tier = await getServerTier();

  // Paid tiers can use any model
  if (canUseAllModelsForTier(tier)) {
    return true;
  }

  // Free tier - check against allowed models
  // Import dynamically to avoid circular dependencies
  const { FREE_MODEL_IDS } = await import('@/data/freeModels');
  return FREE_MODEL_IDS.includes(modelId);
}
