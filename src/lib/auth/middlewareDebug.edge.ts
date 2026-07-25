import { isAuthDebugHeadersEnabled, isAuthTimingDebugEnabled } from '@/lib/env/auth';
import { isServerProd } from '@/lib/env/source';

export function getAuthDebugConfig(): {
  shouldLogTiming: boolean;
  shouldDebugHeaders: boolean;
  startedAt: number;
} {
  const shouldLogTiming = !isServerProd() && isAuthTimingDebugEnabled();
  const shouldDebugHeaders = isAuthDebugHeadersEnabled();
  const startedAt = shouldLogTiming && typeof performance !== 'undefined' ? performance.now() : 0;
  return { shouldLogTiming, shouldDebugHeaders, startedAt };
}

export function authTimingHeaders(opts: {
  startedAt: number;
  shouldLogTiming: boolean;
}): Record<string, string> {
  if (!opts.shouldLogTiming || typeof performance === 'undefined') return {};
  const duration = Math.max(0, performance.now() - opts.startedAt);
  return { 'Server-Timing': `auth;dur=${duration.toFixed(2)}` };
}

export function authDebugHeaders(
  info: Record<string, string>,
  enabled: boolean,
): Record<string, string> {
  if (!enabled) return {};
  return Object.fromEntries(Object.entries(info).map(([key, value]) => [`x-auth-${key}`, value]));
}
