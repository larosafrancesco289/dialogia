import type { ZdrFilterResult, ZdrLists } from '@/lib/zdr';

export type ZdrFilterMode = 'enforce' | 'informational';

export type EnsureListsResult<T> = {
  lists: ZdrLists;
  filter: ZdrFilterResult<T>;
  filtered: T[];
};

export type ZdrSnapshot = {
  modelIds?: Iterable<string> | null;
  providerIds?: Iterable<string> | null;
  fetchedAt?: number;
};
