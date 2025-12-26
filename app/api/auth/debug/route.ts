import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { verifyAuthToken } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const authCookie = req.cookies.get(AUTH_COOKIE_NAME);
  const tierCookie = req.cookies.get(TIER_COOKIE_NAME);

  const hasAuthSecret = !!process.env.AUTH_COOKIE_SECRET;
  const hasCodePepper = !!process.env.ACCESS_CODE_PEPPER;
  const hasDevCodes = !!process.env.ACCESS_CODES_DEVELOPER_HASHED;
  const hasIndividualCodes = !!process.env.ACCESS_CODES_INDIVIDUAL_HASHED;

  // Try to verify the token
  let tokenVerification: any = null;
  if (authCookie?.value) {
    try {
      const claims = verifyAuthToken(authCookie.value);
      tokenVerification = claims ? { valid: true, claims } : { valid: false, reason: 'verification_failed' };
    } catch (e: any) {
      tokenVerification = { valid: false, reason: e?.message || 'error' };
    }
  }

  return NextResponse.json({
    cookies: {
      auth: authCookie ? { exists: true, length: authCookie.value.length } : { exists: false },
      tier: tierCookie?.value || null,
    },
    tokenVerification,
    envVars: {
      AUTH_COOKIE_SECRET: hasAuthSecret ? 'SET' : 'MISSING',
      ACCESS_CODE_PEPPER: hasCodePepper ? 'SET' : 'MISSING',
      ACCESS_CODES_DEVELOPER_HASHED: hasDevCodes ? 'SET' : 'MISSING',
      ACCESS_CODES_INDIVIDUAL_HASHED: hasIndividualCodes ? 'SET' : 'MISSING',
    },
  });
}
