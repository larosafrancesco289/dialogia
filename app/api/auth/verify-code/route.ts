import { NextResponse } from 'next/server';
import {
  AuthClaims,
  AccessTier,
  createAuthToken,
  getIndividualCodeHashes,
  getDeveloperCodeHashes,
  getStudyCodeHashes,
  getAuthCookieSecret,
  getAccessCodePepper,
  hmacCode,
  hasTieredCodesConfigured,
} from '@/lib/auth';
import { setAuthCookies } from '@/lib/auth/cookies.server';
import { jsonAuthError } from '@/lib/auth/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS } from '@/lib/server/rateLimit';
import { route } from '@/lib/server/routeBuilder';
import { VerifyCodeRequestSchema } from '@/lib/schemas/api';
import { parseSchema } from '@/lib/schemas/parse';

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
      const hashed = hmacCode(plain, pepper);

      // Check developer codes first
      const devHashes = getDeveloperCodeHashes();
      const devIdx = devHashes.findIndex((h) => h === hashed);
      if (devIdx !== -1) {
        return createTokenResponse('developer', `dev:${devIdx}`);
      }

      // Check study codes (before individual to prioritize study tier)
      const studyHashes = getStudyCodeHashes();
      const studyIdx = studyHashes.findIndex((h) => h === hashed);
      if (studyIdx !== -1) {
        return createTokenResponse('study', `study:${studyIdx}`);
      }

      // Check individual codes
      const individualHashes = getIndividualCodeHashes();
      const individualIdx = individualHashes.findIndex((h) => h === hashed);
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

function createTokenResponse(tier: AccessTier, sub: string): NextResponse {
  const now = Date.now();
  const claims: AuthClaims = {
    sub,
    tier,
    iat: now,
    exp: now + 1000 * 60 * 60 * 24 * 14, // 14 days
  };

  // Ensure secret is present (throws if missing)
  getAuthCookieSecret();
  const token = createAuthToken(claims);

  const res = NextResponse.json({ ok: true, tier });
  setAuthCookies(res, { token, tier });

  return res;
}
