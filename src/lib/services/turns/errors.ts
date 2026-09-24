// Module: services/turns/errors
// Responsibility: Normalize turn errors into user-facing notices and state updates.

import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import type { StoreGetter } from '@/lib/agent/types';
import { NOTICE_INVALID_KEY, NOTICE_RATE_LIMITED, describeErrorNotice } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';

// The streaming count is not touched here: each turn takes back its own share
// when it ends, and zeroing it would also end a turn started since this one.
export const handleTurnApiError = (error: unknown, get: StoreGetter) => {
  const applyNotice = (notice: string) => notify(get, notice);
  if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    applyNotice(NOTICE_INVALID_KEY);
  } else if (isApiError(error) && error.code === API_ERROR_CODES.RATE_LIMITED) {
    applyNotice(NOTICE_RATE_LIMITED);
  } else {
    // Any other error gets a friendly notice; user-initiated aborts get none.
    const errorMessage = describeErrorNotice(error);
    if (errorMessage) applyNotice(errorMessage);
  }
};
