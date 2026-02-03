import dynamic from 'next/dynamic';
import { createElement, type ComponentType } from 'react';

type DynamicImport<T> = () => Promise<{ default: T }>;

export function lazyClient<T extends ComponentType<unknown>>(
  loader: DynamicImport<T>,
  opts?: { loading?: ComponentType<unknown> | null },
) {
  const loading = opts?.loading ?? null;
  return dynamic(loader, {
    ssr: false,
    loading: loading ? () => createElement(loading) : undefined,
  });
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
