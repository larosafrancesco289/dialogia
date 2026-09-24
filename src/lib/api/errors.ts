// Module: api/errors
// Responsibility: Provide typed error helpers for transport failures and response status handling.

export const API_ERROR_CODES = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  RATE_LIMITED: 'rate_limited',
  STREAM_MISSING_BODY: 'stream_missing_body',
  OPENROUTER_CHAT_FAILED: 'openrouter_chat_failed',
  OPENROUTER_MODELS_FAILED: 'openrouter_models_failed',
  OPENROUTER_ZDR_FAILED: 'openrouter_zdr_failed',
  PROVIDER_CHAT_FAILED: 'provider_chat_failed',
  PROVIDER_MODELS_FAILED: 'provider_models_failed',
} as const);

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES] | string;

export type ApiErrorInit = {
  code: ApiErrorCode;
  message?: string;
  status?: number;
  detail?: unknown;
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status?: number;
  readonly detail?: unknown;

  constructor({ code, message, status, detail }: ApiErrorInit) {
    super(message ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
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
    throw await build(res, API_ERROR_CODES.RATE_LIMITED, 'Rate limited');
  }
  if (!res.ok) {
    const error = await build(res, failureCode);
    options.onFailure?.(error);
    throw error;
  }
}
