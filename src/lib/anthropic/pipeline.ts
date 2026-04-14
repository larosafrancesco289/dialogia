import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
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
      transport: 'anthropic',
      apiKey: opts.apiKey,
      useProxy: opts.useProxy ?? false,
    }),
    tier: opts.tier,
  };
}
