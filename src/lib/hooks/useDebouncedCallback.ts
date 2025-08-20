'use client';
import { useEffect, useMemo, useRef } from 'react';

export function useDebouncedCallback<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number,
) {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  return useMemo(() => {
    let tid: any;
    const wrapped = (...args: any[]) => {
      if (tid) clearTimeout(tid);
      tid = setTimeout(() => ref.current(...args), delayMs);
    };
    (wrapped as any).flush = (...args: any[]) => {
      if (tid) clearTimeout(tid);
      ref.current(...args);
    };
    return wrapped as T & { flush: (...args: Parameters<T>) => void };
  }, [delayMs]);
}

