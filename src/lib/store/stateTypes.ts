import type { ModelIndex } from '@/lib/models';
import type { Chat, Folder, Message, ModelDescriptor } from '@/lib/types';
import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { PersistedUiState, UIState } from '@/lib/store/uiTypes';
import type { StoreActions } from '@/lib/store/actionsTypes';

export type StoreDataState = {
  chats: Chat[];
  folders: Folder[];
  messagesById: Record<string, Message>;
  messageIdsByChatId: Record<string, string[]>;
  selectedChatId?: string;

  models: ModelDescriptor[];
  modelIndex: ModelIndex;
  favoriteModelIds: string[];
  hiddenModelIds: string[];
  // Cached ZDR model ids (ephemeral; not persisted)
  zdrModelIds?: string[];
  // Cached ZDR provider ids (ephemeral; not persisted)
  zdrProviderIds?: string[];
  // Timestamp when ZDR lists were last fetched
  zdrFetchedAt?: number;

  ui: UIState;
};

export type StoreState = StoreDataState & StoreActions;

export type PersistedStoreState = Pick<
  StoreDataState,
  'selectedChatId' | 'favoriteModelIds' | 'hiddenModelIds'
> & {
  ui: PersistedUiState;
};

export type StoreSetter = ContractStoreSetter<StoreState>;
export type StoreGetter = ContractStoreGetter<StoreState>;
