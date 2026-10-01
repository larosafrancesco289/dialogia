// Module: services/turns/errors
// Responsibility: Normalize turn errors into user-facing notices and state updates.

import type { StoreGetter } from '@/lib/agent/types';
import type { TransportAuth } from '@/lib/auth/transport';
import { API_ERROR_CODES, isApiError } from '@/lib/api/errors';
import { markKeyRejected } from '@/lib/keys/store';
import { describeErrorNotice } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';

// The streaming count is not touched here: each turn takes back its own share
// when it ends, and zeroing it would also end a turn started since this one.
export const handleTurnApiError = (error: unknown, get: StoreGetter, auth?: TransportAuth) => {
  // Settings › Connections says so on that provider's row until a new key is saved.
  if (isApiError(error) && error.code === API_ERROR_CODES.UNAUTHORIZED) {
    markKeyRejected(auth?.endpoint.apiKeyRef, auth?.apiKey);
  }
  // A friendly notice for any error; user-initiated aborts get none.
  const errorMessage = describeErrorNotice(error);
  if (errorMessage) notify(get, errorMessage);
};
