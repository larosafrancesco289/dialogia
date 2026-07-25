import { readServerEnvValue } from '@/lib/env/source';
import { readBooleanValue } from '@/lib/env/values';

export function isAuthTimingDebugEnabled(): boolean {
  return readBooleanValue(readServerEnvValue('AUTH_TIMING_DEBUG'), false);
}

export function isAuthDebugHeadersEnabled(): boolean {
  return readBooleanValue(readServerEnvValue('AUTH_DEBUG_HEADERS'), false);
}

export function isAuthDebugRouteEnabled(): boolean {
  return readBooleanValue(readServerEnvValue('AUTH_DEBUG_ROUTE_ENABLED'), false);
}
