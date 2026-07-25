import type { AccessTier } from '@/lib/auth/types';
import { getOpenRouterApiKeyForTier, getServerTier } from '@/lib/auth/tierApiKey.server';
import { createOpenRouterAccess, type OpenRouterAccess } from '@/lib/openrouter/pipeline';

export function resolveOpenRouterAccess(
  req: Request,
  opts: {
    tier?: AccessTier;
    apiKey?: string;
    useProxy?: boolean;
  } = {},
): OpenRouterAccess {
  const tier = opts.tier ?? (opts.apiKey ? 'developer' : getServerTier(req));
  const apiKey = opts.apiKey ?? getOpenRouterApiKeyForTier(tier);
  return createOpenRouterAccess({
    apiKey,
    tier,
    useProxy: opts.useProxy,
  });
}
