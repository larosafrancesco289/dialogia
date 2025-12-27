import 'server-only';
import { jsonError } from '@/lib/server/route';

export type ProxyResponseOptions = {
  contentType?: string;
  cacheControl?: string;
  headers?: HeadersInit;
};

export function getRequestOrigin(req: Request): string | undefined {
  return req.headers.get('origin') || undefined;
}

function buildProxyHeaders(res: Response, opts?: ProxyResponseOptions): Headers {
  const headers = new Headers(res.headers);
  // Remove headers that don't apply after we've consumed/transformed the body
  headers.delete('content-length');
  headers.delete('content-encoding'); // Body is decompressed by fetch, don't claim it's still compressed
  headers.delete('transfer-encoding');
  if (opts?.contentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', opts.contentType);
  }
  headers.set('Cache-Control', opts?.cacheControl ?? 'no-store');
  if (opts?.headers) {
    const extra = new Headers(opts.headers);
    for (const [key, value] of extra.entries()) {
      headers.set(key, value);
    }
  }
  return headers;
}

export function proxyStream(res: Response, opts?: ProxyResponseOptions): Response {
  return new Response(res.body, {
    status: res.status,
    headers: buildProxyHeaders(res, opts),
  });
}

export async function proxyJson(res: Response, opts?: ProxyResponseOptions): Promise<Response> {
  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: buildProxyHeaders(res, { contentType: 'application/json', ...opts }),
  });
}

export function jsonProxyError(error: unknown, code: string, status = 500): Response {
  const message = error instanceof Error ? error.message : code;
  return jsonError(status, code, message);
}

export async function withProxyErrors(
  handler: () => Promise<Response>,
  code: string,
  status = 500,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return jsonProxyError(error, code, status);
  }
}
