// Module: search/providers/failure
// Responsibility: Put a search backend's failure in the words the ledger shows.

import { isApiError } from '@/lib/api/errors';

/**
 * An abort is left to the caller, which knows whether it was a Stop or a
 * timeout; a refused response goes through the backend's own `describeStatus`.
 */
export function describeSearchFailure(
  error: unknown,
  words: { describeStatus: (status: number) => string; unreachable: string },
): string | undefined {
  if (isApiError(error)) {
    const detail = typeof error.detail === 'string' && error.detail.trim() ? error.detail : '';
    return detail || error.code;
  }
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return words.describeStatus(error.status);
  }
  if (error instanceof Error && error.name === 'AbortError') return undefined;
  return words.unreachable;
}
