// Module: api/retry
// Responsibility: Whether a model request that failed may be sent again, and
// after how long. Pure and transport-agnostic: it reads an error's status, its
// code, its body's words and the retry-after headers its response carried, and
// nothing else. The stream decides separately whether anything came out yet.

import { ApiError, API_ERROR_CODES, type RetryAfterHeaders } from '@/lib/api/errors';
import { isRecord } from '@/lib/utils/guards';

/** Times one request is sent again before its failure stands. */
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;
const BACKOFF_FACTOR = 2;
const MAX_BACKOFF_MS = 20_000;
/** A provider that asks for a longer pause than this is not waited on. */
export const MAX_RETRY_WAIT_MS = 60_000;

// Busy, overloaded or briefly unreachable: the same request can succeed later.
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

const BUSY_WORDS = /overloaded|rate[\s_-]?limit|too many requests/i;
// What browsers and Node say when a request never reached the server, or the
// connection dropped: Chrome "Failed to fetch" and "network error", Firefox
// "NetworkError when attempting to fetch resource.", Safari "Load failed".
const NETWORK_WORDS = /fetch|network|load failed|connection/i;

const MAX_DEPTH = 4;

function isAbort(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > MAX_DEPTH) return false;
  if ((error as { name?: unknown }).name === 'AbortError') return true;
  const inner = (error as { detail?: unknown; cause?: unknown }).detail ?? (error as Error).cause;
  return inner !== error && isAbort(inner, depth + 1);
}

/** A fetch that failed to connect: the browser's TypeError, possibly wrapped by a transport. */
function isNetworkFailure(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > MAX_DEPTH) return false;
  if (error instanceof TypeError) return NETWORK_WORDS.test(error.message);
  const inner = (error as { detail?: unknown }).detail ?? error.cause;
  return inner !== error && isNetworkFailure(inner, depth + 1);
}

function saysBusy(detail: unknown): boolean {
  if (typeof detail === 'string') return BUSY_WORDS.test(detail);
  if (!isRecord(detail)) return false;
  try {
    return BUSY_WORDS.test(JSON.stringify(detail));
  } catch {
    return false;
  }
}

/**
 * The provider was busy or out of reach, so the same request may work if sent
 * again: a status that says so (408, 429, 5xx incl. Anthropic's 529), an error
 * sent mid-stream with no status that says it is overloaded or rate limited,
 * or a connection that failed. A refused request (400, 401, 403, 404, 422 and
 * any other status) and a Stop never are.
 */
export function isTransientError(error: unknown): boolean {
  if (isAbort(error)) return false;
  if (error instanceof ApiError) {
    if (error.code === API_ERROR_CODES.UNAUTHORIZED) return false;
    if (typeof error.status === 'number') return TRANSIENT_STATUSES.has(error.status);
    if (error.code === API_ERROR_CODES.RATE_LIMITED) return true;
    if (saysBusy(error.detail)) return true;
  }
  return isNetworkFailure(error);
}

/**
 * The pause, in milliseconds, a response asked for: `retry-after-ms` first
 * (OpenAI's), then `retry-after` as seconds or an HTTP date. Undefined when
 * neither is there or readable; a date already past asks for none.
 */
function parseRetryAfter(
  headers: RetryAfterHeaders | undefined,
  now = Date.now(),
): number | undefined {
  const ms = headers?.retryAfterMs?.trim();
  if (ms && /^\d+(\.\d+)?$/.test(ms)) return Math.ceil(Number(ms));
  const value = headers?.retryAfter?.trim();
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
  // An HTTP date names its day and month; a bare "-3" would parse as a year.
  const at = /[a-z]/i.test(value) ? Date.parse(value) : Number.NaN;
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** The pause an error's response asked for, when it said. */
export function requestedWaitMs(error: unknown, now = Date.now()): number | undefined {
  return error instanceof ApiError ? parseRetryAfter(error.retryAfter, now) : undefined;
}

/**
 * Exponential backoff with full jitter: anywhere from nothing up to 1 s, 2 s,
 * 4 s… (capped at 20 s) for the first, second, third retry, so many clients
 * turned away at once do not all come back together.
 */
function backoffDelayMs(retry: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * BACKOFF_FACTOR ** retry);
  return Math.floor(Math.min(Math.max(random(), 0), 1) * ceiling);
}

export type RetryDecision = { retry: true; delayMs: number } | { retry: false };

/**
 * Whether to send a failed request again after `retries` earlier retries, and
 * when: as soon as the provider asked, or after a backoff. A provider that asks
 * for more than a minute is not waited on; the failure stands, and says so.
 */
export function decideRetry(
  error: unknown,
  retries: number,
  options: { random?: () => number; now?: number } = {},
): RetryDecision {
  if (retries >= MAX_RETRIES || !isTransientError(error)) return { retry: false };
  const asked = requestedWaitMs(error, options.now);
  if (asked !== undefined && asked > MAX_RETRY_WAIT_MS) return { retry: false };
  return { retry: true, delayMs: asked ?? backoffDelayMs(retries, options.random) };
}
