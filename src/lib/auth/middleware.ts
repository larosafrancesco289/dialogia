import type { NextResponse } from 'next/server';
import { PUBLIC_AUTH_PATHS } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeDetailed } from '@/lib/auth/edge';
import { isAuthDebugHeadersEnabled, isAuthTimingDebugEnabled } from '@/lib/env/auth';
import { isProd } from '@/lib/env/runtime';

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_PATHS.includes(pathname);
}

export function getAuthDebugConfig(): {
  shouldLogTiming: boolean;
  shouldDebugHeaders: boolean;
  startedAt: number;
} {
  const shouldLogTiming = !isProd() && isAuthTimingDebugEnabled();
  const shouldDebugHeaders = isAuthDebugHeadersEnabled();
  const startedAt = shouldLogTiming && typeof performance !== 'undefined' ? performance.now() : 0;
  return { shouldLogTiming, shouldDebugHeaders, startedAt };
}

export function applyAuthTimingHeaders(
  res: NextResponse,
  opts: { startedAt: number; shouldLogTiming: boolean },
): NextResponse {
  // Prevent edge caching of auth decisions so cookie changes take effect immediately.
  res.headers.set('x-middleware-cache', 'no-cache');
  if (opts.shouldLogTiming && typeof performance !== 'undefined') {
    const duration = Math.max(0, performance.now() - opts.startedAt);
    res.headers.set('Server-Timing', `auth;dur=${duration.toFixed(2)}`);
  }
  return res;
}

export function applyAuthDebugHeaders(
  res: NextResponse,
  info: Record<string, string>,
  enabled: boolean,
): NextResponse {
  if (!enabled) return res;
  for (const [key, value] of Object.entries(info)) {
    res.headers.set(`x-auth-${key}`, value);
  }
  return res;
}

export async function verifyAuthToken(token: string, secret: string) {
  return verifyAuthTokenEdgeDetailed(token, secret);
}
