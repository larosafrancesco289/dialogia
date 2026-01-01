import { getCookie } from '@/lib/auth/cookies.client';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import type { AccessTier } from '@/lib/auth/types';
import { parseAccessTier } from '@/lib/auth/tier.shared';

export function getClientTier(): AccessTier {
  return parseAccessTier(getCookie(TIER_COOKIE_NAME));
}

export { parseAccessTier };
