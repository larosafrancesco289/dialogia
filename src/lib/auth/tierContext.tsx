'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AccessTier } from './types';
import { getClientTier } from '@/lib/auth/tier.client';
import { getTierFeatures } from '@/lib/auth/tierFeatures';

interface TierContextValue {
  tier: AccessTier;
  isLoading: boolean;
  isFreeTier: boolean;
  isIndividualTier: boolean;
  isDeveloperTier: boolean;
  isStudyTier: boolean;
  canUseVoice: boolean;
  canUseAllModels: boolean;
}

const TierContext = createContext<TierContextValue>({
  tier: 'free',
  isLoading: true,
  isFreeTier: true,
  isIndividualTier: false,
  isDeveloperTier: false,
  isStudyTier: false,
  ...getTierFeatures('free'),
});

export function TierProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<AccessTier>('free');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const currentTier = getClientTier();
    setTier(currentTier);
    setIsLoading(false);
  }, []);

  // Re-check on visibility change (in case cookie was updated in another tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const nextTier = getClientTier();
        if (nextTier !== tier) {
          setTier(nextTier);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [tier]);

  const value: TierContextValue = {
    tier,
    isLoading,
    isFreeTier: tier === 'free',
    isIndividualTier: tier === 'individual',
    isDeveloperTier: tier === 'developer',
    isStudyTier: tier === 'study',
    ...getTierFeatures(tier),
  };

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier(): TierContextValue {
  return useContext(TierContext);
}

/**
 * Hook that returns true if voice mode should be available.
 */
export function useCanUseVoice(): boolean {
  const { canUseVoice, isLoading } = useTier();
  // Default to false while loading to avoid flash of voice UI
  return isLoading ? false : canUseVoice;
}

/**
 * Hook that returns true if user can use all models (not just free).
 */
export function useCanUseAllModels(): boolean {
  const { canUseAllModels, isLoading } = useTier();
  // Default to false while loading
  return isLoading ? false : canUseAllModels;
}

/**
 * Hook that returns true if user is in the study tier (user study participant).
 */
export function useIsStudyTier(): boolean {
  const { isStudyTier, isLoading } = useTier();
  // Default to false while loading
  return isLoading ? false : isStudyTier;
}
