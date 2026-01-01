import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import { NOTICE_INVALID_KEY, NOTICE_RATE_LIMITED } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';
import { clearActiveTurnCount } from '@/lib/ui/streaming';

export const handleTurnApiError = (
  error: unknown,
  set: StoreSetter,
  get: StoreGetter,
  chatId?: string,
) => {
  // Always clear streaming for the affected chat when an error occurs.
  set((state) => ({ ui: clearActiveTurnCount(state.ui, chatId) }));
  const applyNotice = (notice: string) => notify(get, notice);
  if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    applyNotice(NOTICE_INVALID_KEY);
  } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
    applyNotice(NOTICE_RATE_LIMITED);
  } else {
    // For any other error, still clear streaming and show a generic error notice.
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    applyNotice(errorMessage);
  }
};
