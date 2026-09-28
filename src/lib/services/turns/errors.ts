// Module: services/turns/errors
// Responsibility: Normalize turn errors into user-facing notices and state updates.

import type { StoreGetter } from '@/lib/agent/types';
import { describeErrorNotice } from '@/lib/store/notices';
import { notify } from '@/lib/store/notify';

// The streaming count is not touched here: each turn takes back its own share
// when it ends, and zeroing it would also end a turn started since this one.
export const handleTurnApiError = (error: unknown, get: StoreGetter) => {
  // A friendly notice for any error; user-initiated aborts get none.
  const errorMessage = describeErrorNotice(error);
  if (errorMessage) notify(get, errorMessage);
};
