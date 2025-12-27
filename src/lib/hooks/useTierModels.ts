'use client';

import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import { useTier } from '@/lib/auth/tierContext';
import { FREE_MODEL_IDS, FREE_CURATED_MODELS, DEFAULT_FREE_MODEL_ID } from '@/data/freeModels';
import { CURATED_MODELS, DEFAULT_MODEL_ID } from '@/data/curatedModels';

/**
 * Hook that returns models filtered by the current access tier.
 * Free tier users only see models in FREE_MODEL_IDS.
 * Defaults to free models while loading to prevent paid model selection.
 */
export function useTierModels() {
  const allModels = useChatStore((s) => s.models);
  const { tier, isLoading, isFreeTier } = useTier();

  const filteredModels = useMemo(() => {
    // Default to free models while loading to be safe
    if (isLoading || isFreeTier) {
      return allModels.filter((model) => FREE_MODEL_IDS.includes(model.id));
    }
    return allModels;
  }, [allModels, isLoading, isFreeTier]);

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
  const { isFreeTier, isLoading } = useTier();

  return useMemo(() => {
    // Default to free models while loading to be safe
    if (isLoading || isFreeTier) return FREE_CURATED_MODELS;
    return CURATED_MODELS;
  }, [isFreeTier, isLoading]);
}

/**
 * Hook that returns the default model ID for the current tier.
 * Defaults to free model while loading to prevent paid model requests with free API key.
 */
export function useTierDefaultModelId() {
  const { isFreeTier, isLoading } = useTier();

  return useMemo(() => {
    // Default to free model while loading to be safe
    if (isLoading || isFreeTier) return DEFAULT_FREE_MODEL_ID;
    return DEFAULT_MODEL_ID;
  }, [isFreeTier, isLoading]);
}

/**
 * Check if a model is allowed for the current tier.
 */
export function useIsModelAllowed(modelId: string): boolean {
  const { isFreeTier, isLoading } = useTier();

  return useMemo(() => {
    if (isLoading) return true;
    if (!isFreeTier) return true;
    return FREE_MODEL_IDS.includes(modelId);
  }, [modelId, isFreeTier, isLoading]);
}
