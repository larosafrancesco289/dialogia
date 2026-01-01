import type { NextRequest } from 'next/server';
import type { AccessTier } from '@/lib/auth/types';
import { readEnvValue } from '@/lib/env/values';
import type { RateLimitConfig } from '@/lib/server/rateLimit';
import { jsonError, withTiming } from '@/lib/server/route';

type TierGate = {
  allow?: AccessTier[];
  deny?: AccessTier[];
  code?: string;
  message?: string;
};

export type RouteContext = {
  tier?: AccessTier;
  env: Record<string, string>;
};

export type RouteBuilder = {
  rateLimit: (prefix: string, config: RateLimitConfig) => RouteBuilder;
  requireTier: (gate: TierGate) => RouteBuilder;
  requireEnv: (...names: string[]) => RouteBuilder;
  handler: (
    fn: (req: NextRequest, ctx: RouteContext) => Promise<Response>,
  ) => (req: NextRequest) => Promise<Response>;
};

export function route(name: string): RouteBuilder {
  const requiredEnv: string[] = [];
  let limit: { prefix: string; config: RateLimitConfig } | undefined;
  let tierGate: TierGate | undefined;

  const builder: RouteBuilder = {
    rateLimit(prefix, config) {
      limit = { prefix, config };
      return builder;
    },
    requireTier(gate) {
      tierGate = gate;
      return builder;
    },
    requireEnv(...names) {
      requiredEnv.push(...names);
      return builder;
    },
    handler(fn) {
      return async (req: NextRequest) =>
        withTiming(name, async () => {
          if (limit) {
            const { rateLimit } = await import('@/lib/server/rateLimit');
            const limited = await rateLimit(req, limit.prefix, limit.config);
            if (limited) return limited;
          }

          let tier: AccessTier | undefined;
          if (tierGate) {
            const { getServerTier } = await import('@/lib/auth/tierApiKey');
            tier = await getServerTier();
            const deny = tierGate.deny?.includes(tier) ?? false;
            const allow =
              tierGate.allow && tierGate.allow.length > 0 ? tierGate.allow.includes(tier) : true;
            if (deny || !allow) {
              return jsonError(
                403,
                tierGate.code ?? 'feature_not_available',
                tierGate.message ?? 'This feature is not available for your tier.',
              );
            }
          }

          const env: Record<string, string> = {};
          for (const name of requiredEnv) {
            const value = readEnvValue(process.env[name]);
            if (!value) return jsonError(500, 'missing_env', name);
            env[name] = value;
          }

          return fn(req, { tier, env });
        });
    },
  };

  return builder;
}
