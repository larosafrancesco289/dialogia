import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { NOTICE_INVALID_KEY, NOTICE_RATE_LIMITED } from '@/lib/store/notices';

export const handleTurnApiError = (error: unknown, set: StoreSetter, get?: StoreGetter) => {
  // Always reset isStreaming to false when an error occurs
  set((state) => ({ ui: { ...state.ui, isStreaming: false } }));
  const setNotice = get?.().setNotice;
  const applyNotice = (notice: string) => {
    if (typeof setNotice === 'function') {
      setNotice(notice);
    } else {
      set((state) => ({ ui: { ...state.ui, notice } }));
    }
  };
  if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    applyNotice(NOTICE_INVALID_KEY);
  } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
    applyNotice(NOTICE_RATE_LIMITED);
  } else {
    // For any other error, still reset isStreaming and show a generic error notice
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    applyNotice(errorMessage);
  }
};
