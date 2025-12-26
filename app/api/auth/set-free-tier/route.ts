import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, AuthClaims, createAuthToken, getAuthCookieSecret } from '@/lib/auth';
import { TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { getAccessCookieDomain } from '@/lib/config';

/**
 * Sets the free tier for users who want to access without a code.
 * Creates an auth token with tier='free' which limits access to free models only.
 */
export async function POST(req: NextRequest) {
  try {
    const now = Date.now();
    const claims: AuthClaims = {
      sub: 'free:anonymous',
      tier: 'free',
      iat: now,
      exp: now + 1000 * 60 * 60 * 24 * 14, // 14 days
    };

    // Ensure secret is present (throws if missing)
    getAuthCookieSecret();
    const token = createAuthToken(claims);

    const res = NextResponse.json({ ok: true, tier: 'free' });
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
      value: 'free',
      httpOnly: false,
      sameSite: 'lax',
      secure,
      domain,
      path: '/',
      maxAge,
    });

    return res;
  } catch (e: any) {
    console.error('[set-free-tier] Error:', e);
    const message = e?.message || 'internal_error';
    // Surface missing env var errors to help with debugging
    if (message.includes('Missing env')) {
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
