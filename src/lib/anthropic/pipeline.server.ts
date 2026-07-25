import type { AccessTier } from '@/lib/auth/types';
import { getServerTier } from '@/lib/auth/tierApiKey.server';
import { requireServerAnthropicKey } from '@/lib/env/server';
import { createAnthropicAccess, type AnthropicAccess } from '@/lib/anthropic/pipeline';

export function resolveAnthropicAccess(
  req: Request,
  opts: {
    tier?: AccessTier;
    apiKey?: string;
    useProxy?: boolean;
  } = {},
): AnthropicAccess {
  const tier = opts.tier ?? (opts.apiKey ? 'developer' : getServerTier(req));
  const apiKey = opts.apiKey ?? requireServerAnthropicKey();
  return createAnthropicAccess({
    apiKey,
    tier,
    useProxy: opts.useProxy,
  });
}
