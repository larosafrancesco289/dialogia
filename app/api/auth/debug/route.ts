import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { verifyAuthTokenEdgeWithClaims } from '@/lib/auth/edge';

// Force Edge runtime to match middleware
export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const authCookie = req.cookies.get(AUTH_COOKIE_NAME);
  const tierCookie = req.cookies.get(TIER_COOKIE_NAME);

  const secret = process.env.AUTH_COOKIE_SECRET;
  const hasAuthSecret = !!secret;
  const hasCodePepper = !!process.env.ACCESS_CODE_PEPPER;
  const hasDevCodes = !!process.env.ACCESS_CODES_DEVELOPER_HASHED;
  const hasIndividualCodes = !!process.env.ACCESS_CODES_INDIVIDUAL_HASHED;

  // Try to verify the token using Edge runtime (same as middleware)
  let edgeVerification: any = null;
  if (authCookie?.value && secret) {
    try {
      const claims = await verifyAuthTokenEdgeWithClaims(authCookie.value, secret);
      edgeVerification = claims ? { valid: true, claims } : { valid: false, reason: 'verification_failed' };
    } catch (e: any) {
      edgeVerification = { valid: false, reason: e?.message || 'error' };
    }
  } else if (!secret) {
    edgeVerification = { valid: false, reason: 'no_secret_in_edge' };
  }

  return NextResponse.json({
    cookies: {
      auth: authCookie ? { exists: true, length: authCookie.value.length } : { exists: false },
      tier: tierCookie?.value || null,
    },
    edgeVerification,
    envVars: {
      AUTH_COOKIE_SECRET: hasAuthSecret ? 'SET' : 'MISSING',
      ACCESS_CODE_PEPPER: hasCodePepper ? 'SET' : 'MISSING',
      ACCESS_CODES_DEVELOPER_HASHED: hasDevCodes ? 'SET' : 'MISSING',
      ACCESS_CODES_INDIVIDUAL_HASHED: hasIndividualCodes ? 'SET' : 'MISSING',
    },
  });
}
