// Module: store/stateTypes
// Responsibility: Compose the store's shape from the slices that own each part.
// Adding a field or an action means editing exactly one slice file; nothing here
// enumerates them a second time.

import type {
  StoreGetter as ContractStoreGetter,
  StoreSetter as ContractStoreSetter,
} from '@/lib/contracts/store';
import type { ChatSliceActions, ChatSliceState } from '@/lib/store/chatSlice';
import type { EndpointSliceActions, EndpointSliceState } from '@/lib/store/endpointSlice';
import type { MessageSliceActions, MessageSliceState } from '@/lib/store/messageSlice';
import type { ModelSliceActions, ModelSliceState } from '@/lib/store/modelSlice';
import type { UiSliceActions, UiSliceState } from '@/lib/store/uiSlice';
import type { PersistedUiState } from '@/lib/store/uiTypes';

export type StoreDataState = ChatSliceState &
  EndpointSliceState &
  MessageSliceState &
  ModelSliceState &
  UiSliceState;

/**
 * Actions contributed by feature modules. A module augments this interface from its
 * own slice file, so core never names one. With no modules installed it is empty and
 * `StoreActions` is just the core slices.
 */
export interface ModuleStoreActions {}

export type StoreActions = ChatSliceActions &
  EndpointSliceActions &
  MessageSliceActions &
  ModelSliceActions &
  UiSliceActions &
  ModuleStoreActions;

export type StoreState = StoreDataState & StoreActions;

/**
 * The persisted projection. Keys must never be renamed: users' localStorage has
 * to survive. Each slice contributes its own fragment (see `persistence.ts`).
 */
export type PersistedStoreState = Pick<
  StoreDataState,
  | 'selectedChatId'
  | 'customEndpoints'
  | 'favoriteModelIds'
  | 'hiddenModelIds'
  | 'zdrModelIds'
  | 'zdrProviderIds'
  | 'zdrFetchedAt'
> & {
  ui: PersistedUiState;
};

export type StoreSetter = ContractStoreSetter<StoreState>;
export type StoreGetter = ContractStoreGetter<StoreState>;

/** A slice's contribution to the persisted blob. */
export type PersistFragment = {
  partialize(state: StoreState): Record<string, unknown>;
  merge?(current: StoreState, persisted: Record<string, unknown>): Partial<StoreState>;
};
