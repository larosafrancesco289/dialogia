import { ApiError, API_ERROR_CODES, type ApiErrorCode } from '@/lib/api/errors';
import { isRecord } from '@/lib/utils/guards';

export async function readOpenRouterErrorDetail(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatOpenRouterErrorDetail(detail: unknown): string {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (isRecord(detail)) {
    const error = isRecord(detail.error) ? detail.error : detail;
    const parts: string[] = [];
    if (typeof error.message === 'string') parts.push(error.message);
    if (typeof error.code === 'string') parts.push(`code: ${error.code}`);
    if (typeof error.type === 'string') parts.push(`type: ${error.type}`);
    if ('metadata' in error) {
      try {
        parts.push(`metadata: ${JSON.stringify((error as { metadata?: unknown }).metadata)}`);
      } catch {
        // ignore metadata formatting errors
      }
    }
    if (parts.length) return parts.join(' | ');
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export async function buildOpenRouterError(
  res: Response,
  code: ApiErrorCode,
  message?: string,
): Promise<ApiError> {
  const detail = await readOpenRouterErrorDetail(res);
  const detailText = formatOpenRouterErrorDetail(detail);
  const base = message ?? code;
  const statusSuffix = res.status ? ` (${res.status})` : '';
  const suffix = detailText ? `: ${detailText}` : '';
  return new ApiError({
    code,
    status: res.status,
    message: `${base}${statusSuffix}${suffix}`,
    detail,
  });
}

/**
 * OpenRouter can answer 200 and then emit `{"error": {...}}` as a stream chunk.
 * The payload matches the non-streaming error body, so it maps onto the same
 * codes; without this the stream would just stop and look like a short answer.
 */
export function buildOpenRouterStreamError(payload: unknown): ApiError {
  const error = isRecord(payload) ? payload : undefined;
  const status = typeof error?.code === 'number' ? error.code : undefined;
  const code =
    status === 401 || status === 403
      ? API_ERROR_CODES.UNAUTHORIZED
      : status === 429
        ? API_ERROR_CODES.RATE_LIMITED
        : API_ERROR_CODES.OPENROUTER_CHAT_FAILED;
  const detailText = formatOpenRouterErrorDetail(payload);
  const statusSuffix = status ? ` (${status})` : '';
  const suffix = detailText ? `: ${detailText}` : '';
  return new ApiError({
    code,
    status,
    message: `${code}${statusSuffix}${suffix}`,
    detail: payload,
  });
}

export function wrapOpenRouterClientError(error: unknown, code: ApiErrorCode): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.message === 'missing_openrouter_api_key') {
    return new ApiError({
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Missing OpenRouter API key',
      detail: error,
    });
  }
  return new ApiError({
    code,
    message: error instanceof Error ? error.message : code,
    detail: error,
  });
}
