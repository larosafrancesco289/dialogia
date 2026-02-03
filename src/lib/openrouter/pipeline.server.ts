import 'server-only';

import type { AccessTier } from '@/lib/auth/types';
import { getOpenRouterApiKeyForTier, getServerTier } from '@/lib/auth/tierApiKey.server';
import { createOpenRouterAccess, type OpenRouterAccess } from '@/lib/openrouter/pipeline';

export async function resolveOpenRouterAccess(
  opts: {
    tier?: AccessTier;
    apiKey?: string;
    useProxy?: boolean;
  } = {},
): Promise<OpenRouterAccess> {
  const tier = opts.tier ?? (opts.apiKey ? 'developer' : await getServerTier());
  const apiKey = opts.apiKey ?? (await getOpenRouterApiKeyForTier(tier));
  return createOpenRouterAccess({
    apiKey,
    tier,
    useProxy: opts.useProxy,
  });
}
