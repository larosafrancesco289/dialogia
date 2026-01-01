import type { Chat, Message, ModelDescriptor } from '@/lib/types';
import type { ModelIndex } from '@/lib/models';
import type { StoreGetter, StoreSetter } from '@/lib/contracts/store';
import type { UiSearchEntry, UiSnapshot } from '@/lib/contracts/ui';

export type TurnStoreState = {
  chats: Chat[];
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  selectedChatId?: string;
  ui: UiSnapshot;
  // Cached ZDR model ids (ephemeral; not persisted)
  zdrModelIds?: string[];
  // Cached ZDR provider ids (ephemeral; not persisted)
  zdrProviderIds?: string[];
  // Timestamp when ZDR lists were last fetched
  zdrFetchedAt?: number;
  renameChat: (id: string, title: string) => Promise<void>;
  prepareTutorWelcomeMessage?: (chatId?: string) => Promise<string | undefined>;
  setSearchStatus: (messageId: string, entry: UiSearchEntry) => void;
  setNotice: (notice?: string) => void;
};

export type TurnStore = {
  set: StoreSetter<TurnStoreState>;
  get: StoreGetter<TurnStoreState>;
};
