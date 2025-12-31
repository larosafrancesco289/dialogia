import type { AccessTier } from '@/lib/auth/types';

export type TierPolicy = {
  canUseVoice: boolean;
  canUseAllModels: boolean;
};

const TIER_POLICIES: Record<AccessTier, TierPolicy> = {
  free: {
    canUseVoice: false,
    canUseAllModels: false,
  },
  individual: {
    canUseVoice: false,
    canUseAllModels: true,
  },
  developer: {
    canUseVoice: true,
    canUseAllModels: true,
  },
  study: {
    canUseVoice: false,
    canUseAllModels: true,
  },
};

export function getTierPolicy(tier: AccessTier): TierPolicy {
  return TIER_POLICIES[tier];
}

export function canUseVoiceForTier(tier: AccessTier): boolean {
  return getTierPolicy(tier).canUseVoice;
}

export function canUseAllModelsForTier(tier: AccessTier): boolean {
  return getTierPolicy(tier).canUseAllModels;
}
