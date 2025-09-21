import { NextRequest, NextResponse } from 'next/server';
import {
  AUTH_COOKIE_NAME,
  AuthClaims,
  createAuthToken,
  getAccessCodeHashes,
  getAuthCookieSecret,
  getAccessCodePepper,
  hmacCode,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { code } = (await req.json()) as { code?: string };
    const plain = String(code || '').trim();
    if (!plain) return NextResponse.json({ ok: false, error: 'missing_code' }, { status: 400 });

    const pepper = getAccessCodePepper();
    const hashes = getAccessCodeHashes();
    if (hashes.length === 0) {
      return NextResponse.json({ ok: false, error: 'codes_unconfigured' }, { status: 500 });
    }

    // Hash and match
    const hashed = hmacCode(plain, pepper);
    const idx = hashes.findIndex((h) => h === hashed);
    if (idx === -1) {
      // small randomized delay to reduce trivial timing
      await new Promise((r) => setTimeout(r, 50 + Math.floor(Math.random() * 120)));
      return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 401 });
    }

    // Create signed cookie with limited TTL
    // sub is code index; do not store plaintext
    const now = Date.now();
    const claims: AuthClaims = {
      sub: `code:${idx}`,
      iat: now,
      exp: now + 1000 * 60 * 60 * 24 * 14, // 14 days
    };
    // Ensure secret is present (throws if missing)
    getAuthCookieSecret();
    const token = createAuthToken(claims);

    const res = NextResponse.json({ ok: true });
    const secure = process.env.NODE_ENV === 'production';
    const domain = process.env.ACCESS_COOKIE_DOMAIN?.trim() || undefined; // optional cross-subdomain
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure,
      domain,
      path: '/',
      maxAge: 60 * 60 * 24 * 14,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
}
