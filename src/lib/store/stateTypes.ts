import type { ModelIndex } from '@/lib/models';
import type { Chat, Folder, Message, ORModel } from '@/lib/types';
import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { VoiceState } from '@/lib/voice/types';
import type { UIDebugState, UIFlags, UIState, UITutorState } from '@/lib/store/uiTypes';
import type { StoreActions } from '@/lib/store/actionsTypes';

export type StoreDataState = {
  chats: Chat[];
  folders: Folder[];
  messages: Record<string, Message[]>;
  selectedChatId?: string;

  models: ORModel[];
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

  // Voice agent state
  voice: VoiceState;
};

export type StoreState = StoreDataState & StoreActions;

export type PersistedUIState = Pick<
  UIState,
  'showSettings' | 'sidebarCollapsed' | 'zdrOnly' | 'routePreference'
> & {
  flags?: Pick<UIFlags, 'experimentalBrave' | 'experimentalTutor' | 'enableMultiModelChat'>;
  debug?: Pick<UIDebugState, 'mode'>;
  tutor?: Pick<
    UITutorState,
    'contextMode' | 'thesisMode' | 'researchMode' | 'defaultModelId' | 'forceMode'
  >;
};

export type PersistedStoreState = Pick<
  StoreDataState,
  'selectedChatId' | 'favoriteModelIds' | 'hiddenModelIds'
> & {
  ui: PersistedUIState;
};

export type StoreSetter = ContractStoreSetter<StoreState>;
export type StoreGetter = ContractStoreGetter<StoreState>;
