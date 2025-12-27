export type StoreSetter<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: boolean,
) => void;

export type StoreGetter<T> = () => T;
