import { ApiError, API_ERROR_CODES, type ApiErrorCode } from '@/lib/api/errors';
import { isRecord } from '@/lib/utils/guards';

export async function readAnthropicErrorDetail(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function formatAnthropicErrorDetail(detail: unknown): string {
  if (!detail) return '';
  if (typeof detail === 'string') return detail;
  if (isRecord(detail)) {
    const outer = isRecord(detail.error) ? detail.error : detail;
    const parts: string[] = [];
    if (typeof outer.message === 'string') parts.push(outer.message);
    if (typeof outer.type === 'string') parts.push(`type: ${outer.type}`);
    if (typeof outer.error === 'string') parts.push(`error: ${outer.error}`);
    if (parts.length > 0) return parts.join(' | ');
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export async function buildAnthropicError(
  res: Response,
  code: ApiErrorCode,
  message?: string,
): Promise<ApiError> {
  const detail = await readAnthropicErrorDetail(res);
  const detailText = formatAnthropicErrorDetail(detail);
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

export function wrapAnthropicClientError(error: unknown, code: ApiErrorCode): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Error && error.message === 'missing_anthropic_api_key') {
    return new ApiError({
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: 'Missing Anthropic API key',
      detail: error,
    });
  }
  return new ApiError({
    code,
    message: error instanceof Error ? error.message : code,
    detail: error,
  });
}
