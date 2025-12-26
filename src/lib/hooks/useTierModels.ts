'use client';

import { useMemo } from 'react';
import { useChatStore } from '@/lib/store';
import { useTier } from '@/lib/auth/tierContext';
import { FREE_MODEL_IDS, FREE_CURATED_MODELS, DEFAULT_FREE_MODEL_ID } from '@/data/freeModels';
import { CURATED_MODELS, DEFAULT_MODEL_ID } from '@/data/curatedModels';
import type { ORModel } from '@/lib/types/models';

/**
 * Hook that returns models filtered by the current access tier.
 * Free tier users only see models in FREE_MODEL_IDS.
 */
export function useTierModels() {
  const allModels = useChatStore((s) => s.models);
  const { tier, isLoading, isFreeTier } = useTier();

  const filteredModels = useMemo(() => {
    if (isLoading) return allModels;
    if (!isFreeTier) return allModels;

    // Free tier - filter to only free models
    return allModels.filter((model) => FREE_MODEL_IDS.includes(model.id));
  }, [allModels, isLoading, isFreeTier]);

  return {
    models: filteredModels,
    isFiltered: isFreeTier && !isLoading,
    tier,
  };
}

/**
 * Hook that returns curated models for the current tier.
 */
export function useTierCuratedModels() {
  const { isFreeTier, isLoading } = useTier();

  return useMemo(() => {
    if (isLoading) return CURATED_MODELS;
    if (isFreeTier) return FREE_CURATED_MODELS;
    return CURATED_MODELS;
  }, [isFreeTier, isLoading]);
}

/**
 * Hook that returns the default model ID for the current tier.
 */
export function useTierDefaultModelId() {
  const { isFreeTier, isLoading } = useTier();

  return useMemo(() => {
    if (isLoading) return DEFAULT_MODEL_ID;
    if (isFreeTier) return DEFAULT_FREE_MODEL_ID;
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
