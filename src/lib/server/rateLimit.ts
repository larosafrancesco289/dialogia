import 'server-only';
import { NextRequest } from 'next/server';
import { jsonError } from './route';

type RateLimitConfig = {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// In-memory store for rate limiting
// Note: In serverless environments, each instance has its own store
// For distributed rate limiting, consider using Vercel KV or Upstash
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get client IP from request headers.
 * Handles common proxy headers used by Vercel and other platforms.
 */
function getClientIp(req: NextRequest): string {
  // Vercel sets x-forwarded-for
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // Take the first IP in the chain (original client)
    return forwarded.split(',')[0].trim();
  }

  // Fallback headers
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Default fallback
  return 'unknown';
}

/**
 * Check if a request should be rate limited.
 * Returns true if the request should be allowed, false if rate limited.
 */
function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number; resetAt: number } {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Create new entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(key, newEntry);
    return { allowed: true, remaining: config.limit - 1, resetAt: newEntry.resetAt };
  }

  // Increment existing entry
  entry.count++;

  if (entry.count > config.limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit middleware for API routes.
 * Returns a Response if rate limited, or null if allowed.
 */
export function rateLimit(
  req: NextRequest,
  prefix: string,
  config: RateLimitConfig,
): Response | null {
  const ip = getClientIp(req);
  const key = `${prefix}:${ip}`;
  const result = checkRateLimit(key, config);

  if (!result.allowed) {
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
    return jsonError(429, 'rate_limited', `Too many requests. Please try again in ${retryAfter} seconds.`);
  }

  return null;
}

// Preset configurations for common use cases
export const RATE_LIMITS = {
  /** Auth routes: 5 requests per hour */
  AUTH_STRICT: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Auth routes: 10 requests per hour */
  AUTH: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** Expensive API routes: 10 requests per minute */
  EXPENSIVE: { limit: 10, windowMs: 60 * 1000 },
  /** Standard API routes: 30 requests per minute */
  STANDARD: { limit: 30, windowMs: 60 * 1000 },
} as const;
