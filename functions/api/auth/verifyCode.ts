import type { AccessTier, AuthClaims } from '@/lib/auth/types';
import { createAuthToken, hmacHex } from '@/lib/auth/token.edge';
import { buildAuthCookies, withSetCookies } from '@/lib/auth/cookies.server';
import { jsonAuthError } from '@/lib/auth/errors';
import {
  getAccessCodePepper,
  getAuthCookieSecret,
  getDeveloperCodeHashes,
  getIndividualCodeHashes,
  hasTieredCodesConfigured,
} from '@/lib/env/server';
import { logger } from '@/lib/logger';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';
import { VerifyCodeRequestSchema } from '@/lib/schemas/api';
import { parseSchema } from '@/lib/schemas/parse';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export const POST = route('auth-verify-code')
  .rateLimit('auth-verify', RATE_LIMITS.AUTH)
  .handler(async (req) => {
    try {
      const body = await req.json();
      const parsed = parseSchema(VerifyCodeRequestSchema, body);
      if (!parsed.ok) {
        const hasCode = parsed.error.errors.some((issue) => issue.path[0] === 'code');
        return jsonAuthError(hasCode ? 'missing_code' : 'bad_request', 400);
      }
      const plain = parsed.data.code.trim();
      if (!plain) return jsonAuthError('missing_code', 400);

      const pepper = getAccessCodePepper();

      // Check if tiered codes are configured
      if (!hasTieredCodesConfigured()) {
        return jsonAuthError('codes_unconfigured', 500);
      }

      // Hash the submitted code
      const hashed = await hmacHex(plain, pepper);

      // Check developer codes first
      const devIdx = getDeveloperCodeHashes().findIndex((h) => h === hashed);
      if (devIdx !== -1) {
        return createTokenResponse('developer', `dev:${devIdx}`);
      }

      // Check individual codes
      const individualIdx = getIndividualCodeHashes().findIndex((h) => h === hashed);
      if (individualIdx !== -1) {
        return createTokenResponse('individual', `ind:${individualIdx}`);
      }

      // No match found
      // small randomized delay to reduce trivial timing
      await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 120)));
      return jsonAuthError('invalid_code', 401);
    } catch (e: unknown) {
      logger.error('[verify-code] Error:', e);
      return jsonAuthError('bad_request', 400);
    }
  });

async function createTokenResponse(tier: AccessTier, sub: string): Promise<Response> {
  const now = Date.now();
  const claims: AuthClaims = { sub, tier, iat: now, exp: now + TOKEN_TTL_MS };

  const secret = getAuthCookieSecret();
  const token = await createAuthToken(claims, secret);

  const res = new Response(JSON.stringify({ ok: true, tier }), {
    headers: { 'Content-Type': 'application/json' },
  });
  return withSetCookies(res, buildAuthCookies({ token, tier }));
}
