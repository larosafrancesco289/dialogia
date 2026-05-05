import type { AccessTier } from '@/lib/auth/types';
import { DEFAULT_MODEL_ID, DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { DEFAULT_FREE_MODEL_ID, DEFAULT_FREE_TUTOR_MODEL_ID, isFreeModel } from '@/data/freeModels';

export type TierFeatures = {
  canUseAllModels: boolean;
  forceTutorMode: boolean;
};

const TIER_FEATURES: Record<AccessTier, TierFeatures> = {
  free: {
    canUseAllModels: false,
    forceTutorMode: false,
  },
  individual: {
    canUseAllModels: true,
    forceTutorMode: false,
  },
  developer: {
    canUseAllModels: true,
    forceTutorMode: false,
  },
  study: {
    canUseAllModels: true,
    forceTutorMode: true,
  },
};

export function getTierFeatures(tier: AccessTier): TierFeatures {
  return TIER_FEATURES[tier];
}

export function canUseAllModelsForTier(tier: AccessTier): boolean {
  return getTierFeatures(tier).canUseAllModels;
}

export function isTutorForcedForTier(tier: AccessTier): boolean {
  return getTierFeatures(tier).forceTutorMode;
}

export function isModelAllowedForTier(tier: AccessTier, modelId: string): boolean {
  if (canUseAllModelsForTier(tier)) return true;
  return isFreeModel(modelId);
}

export function getDefaultModelIdForTier(tier: AccessTier): string {
  return canUseAllModelsForTier(tier) ? DEFAULT_MODEL_ID : DEFAULT_FREE_MODEL_ID;
}

export function getDefaultTutorModelIdForTier(tier: AccessTier): string {
  return canUseAllModelsForTier(tier) ? DEFAULT_TUTOR_MODEL_ID : DEFAULT_FREE_TUTOR_MODEL_ID;
}
