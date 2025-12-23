import { NextResponse } from 'next/server';

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function withTiming(
  name: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  const startedAt = nowMs();
  const response = await handler();
  const duration = Math.max(0, nowMs() - startedAt);
  const timingValue = `${name};dur=${duration.toFixed(1)}`;
  const existing = response.headers.get('Server-Timing');
  response.headers.set('Server-Timing', existing ? `${existing}, ${timingValue}` : timingValue);
  if (!response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'no-store');
  }
  if (!response.headers.has('Content-Type')) {
    response.headers.set('Content-Type', 'application/json');
  }
  return response;
}

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing_env:${name}`);
  }
  return value;
}

export function jsonError(status: number, code: string, detail?: string): Response {
  const payload = detail ? { error: code, detail } : { error: code };
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
