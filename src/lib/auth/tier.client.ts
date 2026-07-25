import { getCookie } from '@/lib/auth/cookies.client';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import type { AccessTier } from '@/lib/auth/types';
import { parseAccessTier } from '@/lib/auth/tier.shared';
import { isHostedBuild } from '@/lib/env/public';

/**
 * Tiers exist to ration the hosted deployment's own API keys. A BYOK build has
 * no gate and no key to ration — the user pays for every call — so there is
 * nothing to be on the free tier of. Without this, a fresh static build reads
 * the missing cookie as 'free' and hides almost every model.
 */
export function getClientTier(): AccessTier {
  if (!isHostedBuild()) return 'developer';
  return parseAccessTier(getCookie(TIER_COOKIE_NAME));
}

export { parseAccessTier };
