import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth';
import { withTiming } from '@/lib/server/route';

export async function POST() {
  return withTiming('auth-logout', async () => {
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: '',
      maxAge: 0,
      path: '/',
    });
    return res;
  });
}
