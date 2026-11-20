// Module: api/errors
// Responsibility: Provide typed error helpers for transport failures and response status handling.

export const API_ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMITED: 'rate_limited',
  STREAM_MISSING_BODY: 'stream_missing_body',
  /** The connection closed before the provider said the reply was finished. */
  STREAM_CUT_OFF: 'stream_cut_off',
  /** Nothing arrived, not even a keep-alive, for longer than a stream may pause. */
  STREAM_STALLED: 'stream_stalled',
  OPENROUTER_CHAT_FAILED: 'openrouter_chat_failed',
  OPENROUTER_MODELS_FAILED: 'openrouter_models_failed',
  OPENROUTER_ZDR_FAILED: 'openrouter_zdr_failed',
  PROVIDER_CHAT_FAILED: 'provider_chat_failed',
  PROVIDER_MODELS_FAILED: 'provider_models_failed',
} as const);

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES] | string;

/**
 * How long a failed response asked to be left alone, as its headers said it
 * (`retry-after`: seconds or an HTTP date; `retry-after-ms`). Kept as written
 * and read by `api/retry`; a cross-origin response shows them only when the
 * provider exposes them.
 */
export type RetryAfterHeaders = {
  retryAfter?: string;
  retryAfterMs?: string;
};

export type ApiErrorInit = {
  code: ApiErrorCode;
  message?: string;
  status?: number;
  detail?: unknown;
  retryAfter?: RetryAfterHeaders;
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly detail?: unknown;
  retryAfter?: RetryAfterHeaders;

  constructor({ code, message, status, detail, retryAfter }: ApiErrorInit) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryAfter = retryAfter;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A provider's reader for a failed response: its error body into an ApiError. */
type ResponseErrorBuilder = (
  res: Response,
  code: ApiErrorCode,
  message?: string,
) => Promise<ApiError>;

type StatusOptions = {
  /** Sees the error for a failure other than auth or rate limit before it is thrown. */
  onFailure?: (error: ApiError) => void;
};

/**
 * Throws for a response that is not ok: 401 and 403 as unauthorized, 429 as
 * rate limited, and anything else as `failureCode`. The codes are what the
 * store and the turn's notices branch on, so every provider must agree.
 */
export async function throwForStatus(
  res: Response,
  build: ResponseErrorBuilder,
  failureCode: ApiErrorCode,
  options: StatusOptions = {},
): Promise<void> {
  if (res.status === 401 || res.status === 403) {
    throw await build(res, API_ERROR_CODES.UNAUTHORIZED, 'Invalid API key');
  }
  if (res.status === 429) {
    throw withRetryAfter(await build(res, API_ERROR_CODES.RATE_LIMITED, 'Rate limited'), res);
  }
  if (!res.ok) {
    const error = withRetryAfter(await build(res, failureCode), res);
    options.onFailure?.(error);
    throw error;
  }
}

function withRetryAfter(error: ApiError, res: Response): ApiError {
  // A test's stand-in response may have no headers at all.
  const read = (name: string) =>
    typeof res.headers?.get === 'function' ? (res.headers.get(name) ?? undefined) : undefined;
  const retryAfter = read('retry-after');
  const retryAfterMs = read('retry-after-ms');
  if (retryAfter !== undefined || retryAfterMs !== undefined) {
    error.retryAfter = { retryAfter, retryAfterMs };
  }
  return error;
}
