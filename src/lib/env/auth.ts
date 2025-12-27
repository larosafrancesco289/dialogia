import { readBooleanValue } from '@/lib/env/values';

export function isAuthTimingDebugEnabled(): boolean {
  return readBooleanValue(process.env.AUTH_TIMING_DEBUG, false);
}

export function isAuthDebugHeadersEnabled(): boolean {
  return readBooleanValue(process.env.AUTH_DEBUG_HEADERS, false);
}

export function isAuthDebugRouteEnabled(): boolean {
  return readBooleanValue(process.env.AUTH_DEBUG_ROUTE_ENABLED, false);
}
