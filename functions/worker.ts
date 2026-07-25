import { bindServerEnv, type ServerEnvSource } from '@/lib/env/source';
import { jsonError } from '@/lib/server/route';
import { applyAccessGate } from './middleware';
import { isApiPath, resolveApiRoute } from './routes';

type AssetFetcher = { fetch: (req: Request) => Promise<Response> };

export type WorkerEnv = Record<string, unknown> & { ASSETS: AssetFetcher };

/**
 * SPA fallback. Advanced mode bypasses `_redirects`, so an unknown non-asset
 * path is answered with the app shell here instead.
 */
async function serveAsset(request: Request, env: WorkerEnv): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  if (res.status !== 404) return res;
  const shell = await env.ASSETS.fetch(
    new Request(new URL('/index.html', request.url), { headers: request.headers }),
  );
  return new Response(shell.body, {
    status: shell.ok ? 200 : shell.status,
    headers: shell.headers,
  });
}

/**
 * Cloudflare Pages advanced mode: this single worker fronts the static build.
 * It owns the API proxies and the access gate; everything else falls through to
 * the asset server, which applies `_redirects` (and therefore the SPA fallback).
 */
export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    bindServerEnv(env as unknown as ServerEnvSource);

    const { pathname } = new URL(request.url);

    if (isApiPath(pathname)) {
      const handler = resolveApiRoute(pathname, request.method);
      if (!handler) return jsonError(404, 'not_found');
      return handler(request);
    }

    return applyAccessGate(request, () => serveAsset(request, env));
  },
};
