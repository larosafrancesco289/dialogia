'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AccessTier } from './types';
import { TIER_COOKIE_NAME } from './shared';
import { getCookie } from '@/lib/auth/cookies.client';
import { getTierPolicy } from '@/lib/auth/tierPolicy';

interface TierContextValue {
  tier: AccessTier;
  isLoading: boolean;
  isFreeTier: boolean;
  isIndividualTier: boolean;
  isDeveloperTier: boolean;
  canUseVoice: boolean;
  canUseAllModels: boolean;
}

const TierContext = createContext<TierContextValue>({
  tier: 'free',
  isLoading: true,
  isFreeTier: true,
  isIndividualTier: false,
  isDeveloperTier: false,
  ...getTierPolicy('free'),
});

function isValidTier(value: string | null): value is AccessTier {
  return value === 'free' || value === 'individual' || value === 'developer';
}

export function TierProvider({ children }: { children: ReactNode }) {
  const [tier, setTier] = useState<AccessTier>('free');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const cookieTier = getCookie(TIER_COOKIE_NAME);
    if (isValidTier(cookieTier)) {
      setTier(cookieTier);
    }
    setIsLoading(false);
  }, []);

  // Re-check on visibility change (in case cookie was updated in another tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const cookieTier = getCookie(TIER_COOKIE_NAME);
        if (isValidTier(cookieTier) && cookieTier !== tier) {
          setTier(cookieTier);
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
    ...getTierPolicy(tier),
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
