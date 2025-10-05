// Module: api/errors
// Responsibility: Provide typed error helpers for transport failures and response status handling.

export type ApiErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'stream_missing_body'
  | 'openrouter_chat_failed'
  | 'openrouter_models_failed'
  | 'openrouter_zdr_failed'
  | string;

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

export function responseError(res: Response, init: ApiErrorInit): ApiError {
  const baseMessage = init.message ?? `${init.code}${res.status ? ` (${res.status})` : ''}`;
  return new ApiError({ code: init.code, status: res.status, message: baseMessage, detail: init.detail });
}
