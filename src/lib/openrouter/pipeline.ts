import type { AccessTier } from '@/lib/auth/types';
import { buildTransportAuth, type TransportAuth } from '@/lib/auth/transport';
import { OPENROUTER_ENDPOINT } from '@/lib/transport/endpoints';
import { isModelAllowedForTier } from '@/lib/auth/tierFeatures';

export type OpenRouterAccess = {
  auth: TransportAuth;
  tier: AccessTier;
  canUseModel: (modelId: string) => boolean;
};

export function createOpenRouterAccess(opts: {
  apiKey: string;
  tier: AccessTier;
  useProxy?: boolean;
}): OpenRouterAccess {
  const auth = buildTransportAuth({
    endpoint: { ...OPENROUTER_ENDPOINT, useProxy: opts.useProxy ?? false },
    apiKey: opts.apiKey,
  });

  return {
    auth,
    tier: opts.tier,
    canUseModel: (modelId: string) => isModelAllowedForTier(opts.tier, modelId),
  };
}
