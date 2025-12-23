import type { StateCreator } from 'zustand';
import type { StoreState } from '@/lib/store/types';

export type StoreSlice<T extends Partial<StoreState>> = StateCreator<
  StoreState,
  [['zustand/persist', unknown]],
  [],
  T
>;

export function createStoreSlice<T extends Partial<StoreState>>(
  stateCreator: StoreSlice<T>,
): StoreSlice<T> {
  return stateCreator;
}
