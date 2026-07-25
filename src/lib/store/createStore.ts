// Module: store/createStore
// Responsibility: Compose the store initializer from the core slices plus whatever
// the enabled modules contribute. This is the single definition of the store's
// runtime shape — tests and the headless runner build from it rather than
// hand-maintaining their own copies.

import type { StateCreator } from 'zustand';
import type { StoreGetter, StoreSetter, StoreState } from '@/lib/store/types';
import { createChatSlice } from '@/lib/store/chatSlice';
import { createMessageSlice } from '@/lib/store/messageSlice';
import { createModelSlice } from '@/lib/store/modelSlice';
import { createUiSlice } from '@/lib/store/uiSlice';
import { ENABLED_MODULES, type AppModule } from '@/lib/modules';

export type StoreInitializer = StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  StoreState
>;

export function buildStoreInitializer(modules: AppModule[] = ENABLED_MODULES): StoreInitializer {
  return (set, get, store) => {
    const sliceSet = set as StoreSetter;
    const sliceGet = get as StoreGetter;

    const moduleSlices = modules.reduce<Record<string, unknown>>((acc, appModule) => {
      const slice = appModule.storeSlice?.(sliceSet, sliceGet, store);
      return slice ? { ...acc, ...slice } : acc;
    }, {});

    return {
      ...createModelSlice(set, get, store),
      ...createChatSlice(sliceSet, sliceGet, store),
      ...createMessageSlice(sliceSet, sliceGet, store),
      ...createUiSlice(set, get, store),
      ...moduleSlices,
    } as StoreState;
  };
}
