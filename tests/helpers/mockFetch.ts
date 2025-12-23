export type FetchMock = typeof fetch;

export function mockFetch(mockImpl: FetchMock) {
  const original = globalThis.fetch;
  globalThis.fetch = mockImpl;
  return () => {
    if (original) {
      globalThis.fetch = original;
    } else {
      delete (globalThis as any).fetch;
    }
  };
}
