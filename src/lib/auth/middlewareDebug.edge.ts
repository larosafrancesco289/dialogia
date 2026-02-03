import type { NextResponse } from 'next/server';
import { isAuthDebugHeadersEnabled, isAuthTimingDebugEnabled } from '@/lib/env/auth';
import { isProd } from '@/lib/env/runtime';

// Debug notes (Vercel redirect loop, Dec 2025):
// - /api/auth/set-free-tier returns 200 and sets dlg_access/dlg_tier.
// - GET / sends dlg_access but receives 307 with x-auth-reason=invalid_token.
// - /api/auth/debug (edge) verifies the same token as valid.
// - ACCESS_COOKIE_DOMAIN unset; cookie is host-only and included on requests.
// => Indicates middleware is running with a different secret (stale Edge build/env).

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
