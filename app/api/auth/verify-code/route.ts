import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AuthClaims,
  AccessTier,
  createAuthToken,
  getIndividualCodeHashes,
  getDeveloperCodeHashes,
  getAuthCookieSecret,
  getAccessCodePepper,
  hmacCode,
  hasTieredCodesConfigured,
} from '@/lib/auth';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { isCodeConsumed, markCodeConsumed } from '@/lib/auth/codeStore';
import { getAccessCookieDomain } from '@/lib/config';
import { jsonAuthError } from '@/lib/auth/errors';

export async function POST(req: NextRequest) {
  try {
    const { code } = (await req.json()) as { code?: string };
    const plain = String(code || '').trim();
    if (!plain) return jsonAuthError('missing_code', 400);

    const pepper = getAccessCodePepper();

    // Check if tiered codes are configured
    if (!hasTieredCodesConfigured()) {
      return jsonAuthError('codes_unconfigured', 500);
    }

    // Hash the submitted code
    const hashed = hmacCode(plain, pepper);

    // Check developer codes first (they're never consumed)
    const devHashes = getDeveloperCodeHashes();
    const devIdx = devHashes.findIndex((h) => h === hashed);
    if (devIdx !== -1) {
      return createTokenResponse('developer', `dev:${devIdx}`);
    }

    // Check individual codes (one-time use)
    const individualHashes = getIndividualCodeHashes();
    const individualIdx = individualHashes.findIndex((h) => h === hashed);
    if (individualIdx !== -1) {
      // Check if this code has been consumed
      const consumed = await isCodeConsumed(hashed);
      if (consumed) {
        // small randomized delay to reduce trivial timing
        await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 120)));
        return jsonAuthError('code_already_used', 401);
      }

      // Mark code as consumed before creating token
      await markCodeConsumed(hashed);

      return createTokenResponse('individual', `ind:${individualIdx}`);
    }

    // No match found
    // small randomized delay to reduce trivial timing
    await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 120)));
    return jsonAuthError('invalid_code', 401);
  } catch (e: any) {
    console.error('[verify-code] Error:', e);
    return jsonAuthError('bad_request', 400);
  }
}

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
  const secure = process.env.NODE_ENV === 'production';
  const domain = getAccessCookieDomain();
  const maxAge = 60 * 60 * 24 * 14; // 14 days

  // Set the auth token (httpOnly)
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure,
    domain,
    path: '/',
    maxAge,
  });

  // Set the tier cookie (readable by client)
  res.cookies.set({
    name: TIER_COOKIE_NAME,
    value: tier,
    httpOnly: false,
    sameSite: 'lax',
    secure,
    domain,
    path: '/',
    maxAge,
  });

  return res;
}
