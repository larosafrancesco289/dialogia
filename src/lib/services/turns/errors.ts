import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import type { StoreSetter } from '@/lib/agent/types';
import { NOTICE_INVALID_KEY, NOTICE_RATE_LIMITED } from '@/lib/store/notices';

export const handleTurnApiError = (error: unknown, set: StoreSetter) => {
  if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    set((state) => ({ ui: { ...state.ui, isStreaming: false, notice: NOTICE_INVALID_KEY } }));
  } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
    set((state) => ({ ui: { ...state.ui, isStreaming: false, notice: NOTICE_RATE_LIMITED } }));
  }
};
