'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { AccessTier } from './types';
import { TIER_COOKIE_NAME } from './shared';

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
  canUseVoice: false,
  canUseAllModels: false,
});

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

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
    canUseVoice: tier === 'developer',
    canUseAllModels: tier !== 'free',
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
