import { Suspense, createElement, lazy, type ComponentProps, type ComponentType } from 'react';

type DynamicImport<T> = () => Promise<{ default: T }>;

/**
 * Code-split boundary for client components. The Suspense wrapper is part of
 * the returned component so call sites stay a drop-in for a plain import.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the props are recovered by ComponentProps<T>
export function lazyClient<T extends ComponentType<any>>(
  loader: DynamicImport<T>,
  opts?: { loading?: ComponentType<unknown> | null },
): ComponentType<ComponentProps<T>> {
  const Loading = opts?.loading ?? null;
  const Lazy = lazy(loader);
  const fallback = Loading ? createElement(Loading) : null;
  return function LazyBoundary(props: ComponentProps<T>) {
    return createElement(Suspense, { fallback }, createElement(Lazy, props));
  };
}

type IdleCallbackHandle = number;
type IdleRequestCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
type WindowWithIdle = Window & {
  requestIdleCallback?: (
    cb: IdleRequestCallback,
    opts?: { timeout?: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (id: IdleCallbackHandle) => void;
};

export function prefetchOnIdle(
  loadFn: () => Promise<unknown>,
  opts?: { timeoutMs?: number },
): () => void {
  if (typeof window === 'undefined') return () => {};
  const timeoutMs = opts?.timeoutMs ?? 1500;
  const warm = () => {
    loadFn().catch(() => undefined);
  };

  const win = window as WindowWithIdle;
  if (typeof win.requestIdleCallback === 'function') {
    const id = win.requestIdleCallback(() => warm(), { timeout: timeoutMs });
    return () => {
      if (typeof win.cancelIdleCallback === 'function') win.cancelIdleCallback(id);
    };
  }

  const tid = window.setTimeout(warm, Math.min(300, timeoutMs));
  return () => window.clearTimeout(tid);
}
