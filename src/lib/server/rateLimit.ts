import { jsonError } from './route';
import { readServerEnvValue } from '@/lib/env/source';

export type RateLimitConfig = {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimiter = {
  check: (key: string, config: RateLimitConfig) => Promise<RateLimitResult> | RateLimitResult;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export class MemoryRateLimiter implements RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private lastCleanup = Date.now();
  private cleanupIntervalMs = 60_000;

  constructor(opts?: { cleanupIntervalMs?: number }) {
    if (opts?.cleanupIntervalMs) this.cleanupIntervalMs = opts.cleanupIntervalMs;
  }

  private cleanupExpiredEntries() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupIntervalMs) return;

    this.lastCleanup = now;
    for (const [key, entry] of this.store) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }

  check(key: string, config: RateLimitConfig): RateLimitResult {
    this.cleanupExpiredEntries();

    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      const newEntry: RateLimitEntry = {
        count: 1,
        resetAt: now + config.windowMs,
      };
      this.store.set(key, newEntry);
      return { allowed: true, remaining: config.limit - 1, resetAt: newEntry.resetAt };
    }

    entry.count += 1;

    if (entry.count > config.limit) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
  }
}

type UpstashResponse<T> = { result?: T; error?: string };

export class UpstashRateLimiter implements RateLimiter {
  private url: string;
  private token: string;

  constructor(opts: { url: string; token: string }) {
    this.url = opts.url;
    this.token = opts.token;
  }

  private async command<T>(args: unknown[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error('rate_limit_upstash_failed');
    const payload = (await res.json()) as UpstashResponse<T>;
    if (payload?.error) throw new Error(payload.error);
    return payload?.result as T;
  }

  async check(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const rawCount = await this.command<number | string>(['INCR', key]);
    const count = Number(rawCount);
    if (!Number.isFinite(count)) throw new Error('rate_limit_upstash_bad_count');

    const rawTtl = await this.command<number | string>(['PTTL', key]);
    let ttl = Number(rawTtl);
    if (!Number.isFinite(ttl) || ttl < 0) {
      await this.command<number>(['PEXPIRE', key, Math.max(1, Math.floor(config.windowMs))]);
      ttl = config.windowMs;
    }

    const remaining = Math.max(0, config.limit - count);
    const resetAt = Date.now() + Math.max(0, ttl);
    return { allowed: count <= config.limit, remaining, resetAt };
  }
}

/**
 * Client IP from request headers. Cloudflare sets CF-Connecting-IP and it
 * cannot be spoofed by the client, so it wins over the forwarding chain.
 */
function getClientIp(req: Request): string {
  const cfIp = req.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp.trim();

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take the first IP in the chain (original client)
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  return 'unknown';
}

let cachedLimiter: RateLimiter | undefined;

/**
 * Resolved lazily: the worker binds its environment per request, so the
 * Upstash credentials are not readable at module-eval time.
 */
function defaultRateLimiter(): RateLimiter {
  if (cachedLimiter) return cachedLimiter;
  const url = readServerEnvValue('UPSTASH_REDIS_REST_URL');
  const token = readServerEnvValue('UPSTASH_REDIS_REST_TOKEN');
  cachedLimiter = url && token ? new UpstashRateLimiter({ url, token }) : new MemoryRateLimiter();
  return cachedLimiter;
}

/**
 * Rate limit middleware for API routes.
 * Returns a Response if rate limited, or null if allowed.
 */
export async function rateLimit(
  req: Request,
  prefix: string,
  config: RateLimitConfig,
): Promise<Response | null> {
  const ip = getClientIp(req);
  const key = `${prefix}:${ip}`;
  let result: RateLimitResult;
  try {
    result = await defaultRateLimiter().check(key, config);
  } catch {
    return null;
  }

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return jsonError(
      429,
      'rate_limited',
      `Too many requests. Please try again in ${retryAfter} seconds.`,
      {
        'Retry-After': String(Math.max(0, retryAfter)),
        'X-RateLimit-Limit': String(config.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    );
  }

  return null;
}

// Preset configurations for common use cases
export const RATE_LIMITS = {
  /** Auth routes: 5 requests per hour */
  AUTH_STRICT: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Auth routes: 10 requests per hour */
  AUTH: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Anthropic free/self-serve accounts are commonly limited to 5 RPM */
  ANTHROPIC_CHAT: { limit: 5, windowMs: 60 * 1000 },
  /** Model metadata is cacheable, so keep this modest too */
  ANTHROPIC_MODELS: { limit: 10, windowMs: 60 * 1000 },
  /** Expensive API routes: 10 requests per minute */
  EXPENSIVE: { limit: 10, windowMs: 60 * 1000 },
  /** Standard API routes: 30 requests per minute */
  STANDARD: { limit: 30, windowMs: 60 * 1000 },
} as const;
