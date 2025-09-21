'use client';
import { useEffect } from 'react';

export function useAutogrowTextarea(
  ref: React.RefObject<HTMLTextAreaElement>,
  deps: any[] = [],
  maxHeight = 200,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const limit = Number.isFinite(maxHeight) ? Math.max(120, maxHeight) : 200;
    el.style.height = Math.min(el.scrollHeight, limit) + 'px';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, maxHeight]);
}
