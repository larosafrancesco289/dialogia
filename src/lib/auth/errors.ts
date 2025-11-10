import { NextRequest, NextResponse } from 'next/server';

const ACCESS_PATH = '/access';

export function redirectToAccess(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = ACCESS_PATH;
  url.search = '';
  return NextResponse.redirect(url);
}

export function jsonAuthError(code: string, status = 400): NextResponse {
  return NextResponse.json({ ok: false, error: code }, { status });
}
