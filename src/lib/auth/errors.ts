import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/server/route';

const ACCESS_PATH = '/access';

export function redirectToAccess(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = ACCESS_PATH;
  url.search = '';
  const res = NextResponse.redirect(url);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export function jsonAuthError(code: string, status = 400, detail?: string): Response {
  return jsonError(status, code, detail);
}
