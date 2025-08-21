'use client';
import { useEffect } from 'react';

export function useAutogrowTextarea(ref: React.RefObject<HTMLTextAreaElement>, deps: any[] = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
