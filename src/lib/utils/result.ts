export type Result<T extends Record<string, unknown>, E> =
  | ({ ok: true } & T)
  | ({ ok: false; error: E } & Partial<T>);

export const ok = <T extends Record<string, unknown>>(data: T): Result<T, never> => ({
  ok: true,
  ...data,
});

export const err = <E, T extends Record<string, unknown> = Record<string, never>>(
  error: E,
  data?: Partial<T>,
): Result<T, E> => {
  const payload: Partial<T> = data ?? {};
  return {
    ok: false,
    error,
    ...payload,
  };
};
