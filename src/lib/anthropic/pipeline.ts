import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { ANTHROPIC_ENDPOINT } from '@/lib/transport/endpoints';
import type { AccessTier } from '@/lib/auth/types';

export type AnthropicAccess = {
  auth: TransportAuth;
  tier: AccessTier;
};

export function createAnthropicAccess(opts: {
  apiKey: string;
  tier: AccessTier;
  useProxy?: boolean;
}): AnthropicAccess {
  return {
    auth: buildTransportAuth({
      endpoint: { ...ANTHROPIC_ENDPOINT, useProxy: opts.useProxy ?? false },
      apiKey: opts.apiKey,
    }),
    tier: opts.tier,
  };
}
