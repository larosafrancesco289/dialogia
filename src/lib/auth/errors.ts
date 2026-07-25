import { jsonError } from '@/lib/server/route';

const ACCESS_PATH = '/access';

export function redirectToAccess(req: Request): Response {
  const url = new URL(req.url);
  url.pathname = ACCESS_PATH;
  url.search = '';
  return new Response(null, {
    status: 307,
    headers: { Location: url.toString(), 'Cache-Control': 'no-store' },
  });
}

export function jsonAuthError(code: string, status = 400, detail?: string): Response {
  return jsonError(status, code, detail);
}
