'use client';

import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import { useTier } from '@/lib/auth/tierContext';
import { FREE_CURATED_MODELS } from '@/data/freeModels';
import { CURATED_MODELS } from '@/data/curatedModels';
import { filterCuratedModelsByAvailability } from '@/lib/models/curatedAvailability';
import { findModelById, isDynamicModelId, resolveDynamicModelId } from '@/lib/models';
import {
  canUseAllModelsForTier,
  getDefaultModelIdForTier,
  getDefaultTutorModelIdForTier,
  isModelAllowedForTier,
} from '@/lib/auth/tierFeatures';
import { isModelTransportAvailable, isTransportAvailable } from '@/lib/policy/providerAvailability';

/**
 * Hook that returns models filtered by the current access tier.
 * Free tier users only see models in FREE_MODEL_IDS.
 * Defaults to free models while loading to prevent paid model selection.
 */
export function useTierModels() {
  const allModels = useChatStore((s) => s.models);
  const { tier, isLoading, isFreeTier } = useTier();

  const filteredModels = useMemo(() => {
    const effectiveTier = isLoading ? 'free' : tier;
    const availableModels = allModels.filter((model) => isModelTransportAvailable(model));
    if (canUseAllModelsForTier(effectiveTier)) return availableModels;
    return availableModels.filter((model) => isModelAllowedForTier(effectiveTier, model.id));
  }, [allModels, isLoading, tier]);

  return {
    models: filteredModels,
    isFiltered: isLoading || isFreeTier,
    tier,
  };
}

/**
 * Hook that returns curated models for the current tier.
 * Defaults to free models while loading to prevent paid model requests with free API key.
 */
export function useTierCuratedModels() {
  const allModels = useChatStore((s) => s.models);
  const { tier, isLoading } = useTier();

  return useMemo(() => {
    // Default to free models while loading to be safe
    const effectiveTier = isLoading ? 'free' : tier;
    if (!isTransportAvailable('openrouter') && !isTransportAvailable('anthropic')) return [];
    const curated = canUseAllModelsForTier(effectiveTier) ? CURATED_MODELS : FREE_CURATED_MODELS;
    const availableIds = new Set((allModels || []).map((model) => model.id));
    if (availableIds.size === 0) return [];
    // Resolve dynamic aliases to the concrete model they currently pick, and
    // surface that pick in the description so "latest" is never a mystery.
    const resolved = curated.map((entry) => {
      if (!isDynamicModelId(entry.id)) return entry;
      const concreteId = resolveDynamicModelId(entry.id, allModels || []);
      const concrete = findModelById(allModels || [], concreteId);
      const currentName = concrete?.name || concreteId;
      return {
        ...entry,
        id: concreteId,
        description: `${entry.description}. Currently: ${currentName}`,
      };
    });
    return filterCuratedModelsByAvailability(resolved, availableIds);
  }, [allModels, isLoading, tier]);
}

/**
 * Hook that returns the default model ID for the current tier.
 * Defaults to free model while loading to prevent paid model requests with free API key.
 */
export function useTierDefaultModelId() {
  const allModels = useChatStore((s) => s.models);
  const { tier, isLoading } = useTier();

  return useMemo(() => {
    // Default to free model while loading to be safe
    const effectiveTier = isLoading ? 'free' : tier;
    return resolveDynamicModelId(getDefaultModelIdForTier(effectiveTier), allModels || []);
  }, [allModels, isLoading, tier]);
}

/**
 * Check if a model is allowed for the current tier.
 */
export function useIsModelAllowed(modelId: string): boolean {
  const { tier, isLoading } = useTier();

  return useMemo(() => {
    if (isLoading) return true;
    return isModelAllowedForTier(tier, modelId);
  }, [modelId, isLoading, tier]);
}

/**
 * Resolve a tutor model ID with tier awareness.
 * Returns the free tutor model for free tier users if the requested model is not free.
 */
export function useTierTutorModelId(rawModelId: string | undefined): string | undefined {
  const { isFreeTier } = useTier();

  return useMemo(() => {
    if (!rawModelId) return rawModelId;
    if (isFreeTier && !isModelAllowedForTier('free', rawModelId)) {
      return getDefaultTutorModelIdForTier('free');
    }
    return rawModelId;
  }, [isFreeTier, rawModelId]);
}
