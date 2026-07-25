// Module: modules/tutor/lib/bootstrap
// Responsibility: What the tutor module wants warmed once the store has hydrated.

import type { StoreGetter, StoreSetter } from '@/lib/store/types';

export async function warmTutorProfile(store: { get: StoreGetter; set: StoreSetter }) {
  const chatId = store.get().selectedChatId;
  if (!chatId) return;
  await store.get().loadTutorProfileIntoUI(chatId);
}
