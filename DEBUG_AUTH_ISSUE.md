# Auth Redirect Loop - Debug Investigation

## Problem

On Vercel production deployment, users get stuck in a redirect loop:
1. Clicking "Continue with Free Tier" on `/access` page redirects back to `/access`
2. Entering a valid access code also redirects back to `/access`
3. The free tier should work without any code, but doesn't

## What We Know

- Environment variables are correctly set on Vercel (verified via import)
- Variables configured: `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, `OPENROUTER_API_KEY`, `NEXT_PUBLIC_USE_OR_PROXY=true`, `ACCESS_CODES_DEVELOPER_HASHED`, `ACCESS_CODES_INDIVIDUAL_HASHED`
- Local development works fine
- The issue only happens in production on Vercel

## Investigation Tasks

1. **Check Vercel Function Logs**
   - Look at `/api/auth/set-free-tier` logs when clicking free tier
   - Look at `/api/auth/verify-code` logs when entering a code
   - Check if the API routes are returning success or errors

2. **Debug the Cookie Setting**
   - Verify cookies are being set in the response headers
   - Check if `Set-Cookie` headers have correct attributes (Secure, SameSite, Domain, Path)
   - Use browser DevTools Network tab to inspect the response

3. **Debug the Middleware**
   - Check if middleware is running on Vercel Edge
   - Verify `AUTH_COOKIE_SECRET` is accessible in Edge runtime
   - Add logging to see if token verification is failing and why

4. **Potential Root Causes to Investigate**
   - Edge runtime environment variable access differs from Node runtime
   - Cookie domain mismatch between API route and main domain
   - `SameSite` attribute blocking cookies on redirect
   - Token creation using different secret than verification
   - Timing issue where redirect happens before cookie is set

5. **Test the Debug Endpoint**
   - Visit `/api/auth/debug` on production to check if secrets are loaded
   - Compare the debug output between local and Vercel

## Files to Review

- `middleware.ts` - Token verification logic
- `app/api/auth/set-free-tier/route.ts` - Free tier cookie setting
- `app/api/auth/verify-code/route.ts` - Access code verification
- `src/lib/auth/edge.ts` - Edge-compatible token verification
- `src/lib/auth/index.ts` - Token creation
- `src/lib/config.ts` - `getAccessCookieDomain()` function

## Quick Debug Steps

1. Open browser DevTools > Network tab
2. Click "Continue with Free Tier"
3. Check the `/api/auth/set-free-tier` response:
   - Status code (should be 200)
   - Response body (should be `{"ok":true,"tier":"free"}`)
   - `Set-Cookie` headers (should have `dlg_access` and `dlg_tier`)
4. Check the redirect to `/`:
   - Does the request include the `dlg_access` cookie?
   - What response does middleware return?

## Hypothesis

Most likely cause: The middleware runs on Vercel Edge Runtime, but environment variables may not be properly propagated to the Edge, causing `AUTH_COOKIE_SECRET` to be undefined and all token verifications to fail.
