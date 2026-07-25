import { AUTH_COOKIE_NAME, TIER_COOKIE_NAME } from '@/lib/auth/shared';
import { readRequestCookie, serializeCookie } from '@/lib/auth/cookies.server';
import { redirectToAccess } from '@/lib/auth/errors';
import { computeSecretFingerprintEdge } from '@/lib/auth/fingerprint.edge';
import { isPublicAuthPath, verifyAuthToken } from '@/lib/auth/middleware';
import {
  authDebugHeaders,
  authTimingHeaders,
  getAuthDebugConfig,
} from '@/lib/auth/middlewareDebug.edge';
import type { AccessTier } from '@/lib/auth/types';
import { isServerProd, readServerEnvValue } from '@/lib/env/source';

const TIER_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

/**
 * Static assets carry an extension and must stay reachable, or the /access page
 * itself cannot load the bundle that renders it.
 */
function isStaticAsset(pathname: string): boolean {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return lastSegment.includes('.');
}

function withExtraHeaders(res: Response, extra: Record<string, string>): Response {
  const entries = Object.entries(extra);
  if (entries.length === 0) return res;
  const headers = new Headers(res.headers);
  for (const [key, value] of entries) headers.set(key, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function withTierCookie(res: Response, tier: AccessTier, secure: boolean): Response {
  const headers = new Headers(res.headers);
  headers.append(
    'Set-Cookie',
    serializeCookie(TIER_COOKIE_NAME, tier, {
      httpOnly: false,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: TIER_COOKIE_MAX_AGE,
    }),
  );
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * The hosted access gate. Serves the request when it is allowed through, and
 * answers with a redirect to /access when it is not.
 */
export async function applyAccessGate(
  req: Request,
  serve: () => Promise<Response>,
): Promise<Response> {
  const { shouldLogTiming, shouldDebugHeaders, startedAt } = getAuthDebugConfig();
  const timing = () => authTimingHeaders({ startedAt, shouldLogTiming });
  const deny = (reason: string) =>
    withExtraHeaders(redirectToAccess(req), {
      ...timing(),
      ...authDebugHeaders({ reason }, shouldDebugHeaders),
    });

  const { pathname } = new URL(req.url);

  if (!isServerProd()) {
    const res = withExtraHeaders(await serve(), timing());
    const currentTier = readRequestCookie(req, TIER_COOKIE_NAME);
    return currentTier === 'developer' ? res : withTierCookie(res, 'developer', false);
  }

  if (isPublicAuthPath(pathname) || isStaticAsset(pathname)) return serve();

  const token = readRequestCookie(req, AUTH_COOKIE_NAME);
  if (!token) return deny('missing_cookie');

  const secret = readServerEnvValue('AUTH_COOKIE_SECRET');
  if (!secret) return deny('missing_secret');

  const result = await verifyAuthToken(token, secret);
  if (!result.ok) {
    const fingerprint = await computeSecretFingerprintEdge(secret);
    return withExtraHeaders(redirectToAccess(req), {
      ...timing(),
      ...authDebugHeaders(
        { reason: result.reason, token_len: String(token.length), secret_fp: fingerprint },
        shouldDebugHeaders,
      ),
    });
  }

  const tier: AccessTier = result.claims.tier || 'free';
  const res = withExtraHeaders(await serve(), timing());
  const currentTier = readRequestCookie(req, TIER_COOKIE_NAME);
  return currentTier === tier ? res : withTierCookie(res, tier, true);
}
