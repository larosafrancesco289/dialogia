import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { route } from '@/lib/server/routeBuilder';

export const POST = route('auth-logout').handler(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    maxAge: 0,
    path: '/',
  });
  return res;
});
