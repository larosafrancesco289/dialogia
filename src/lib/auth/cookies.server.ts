import 'server-only';

import type { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import type { AccessTier } from '@/lib/auth/types';
import { getAccessCookieDomain } from '@/lib/env/server';
import { isProd } from '@/lib/env/runtime';

const DEFAULT_MAX_AGE = 60 * 60 * 24 * 14;

export function setAuthCookies(
  res: NextResponse,
  options: {
    token: string;
    tier: AccessTier;
    maxAge?: number;
    secure?: boolean;
    domain?: string;
  },
): void {
  const secure = options.secure ?? isProd();
  const domain = options.domain ?? getAccessCookieDomain();
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
  const shared = {
    sameSite: 'lax' as const,
    secure,
    domain,
    path: '/',
    maxAge,
  };

  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: options.token,
    httpOnly: true,
    ...shared,
  });

  res.cookies.set({
    name: TIER_COOKIE_NAME,
    value: options.tier,
    httpOnly: false,
    ...shared,
  });
}
