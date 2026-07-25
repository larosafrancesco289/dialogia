/**
 * The transports only route through the relative proxy path in a page context,
 * so exercising that path needs a `window` the way the worker never has one.
 */
export function fakeBrowser(): () => void {
  const had = 'window' in globalThis;
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    document: {},
    location: { origin: 'http://localhost:3000' },
  };
  return () => {
    if (had) (globalThis as { window?: unknown }).window = original;
    else delete (globalThis as { window?: unknown }).window;
  };
}
