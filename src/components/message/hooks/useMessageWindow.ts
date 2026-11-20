import { useEffect, useMemo, useState } from 'react';

export function useMessageWindow<T>(
  items: T[],
  opts?: { pageSize?: number; resetKey?: unknown; includeIndex?: number },
) {
  const pageSize = opts?.pageSize ?? 150;
  const total = items.length;
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
  }, [pageSize, opts?.resetKey]);

  useEffect(() => {
    setCount((prev) => {
      const needed =
        typeof opts?.includeIndex === 'number' && opts.includeIndex >= 0
          ? total - opts.includeIndex
          : 0;
      const next = Math.max(pageSize, prev, needed);
      return next === prev ? prev : next;
    });
  }, [pageSize, opts?.includeIndex, total]);

  const startIndex = Math.max(0, total - count);
  const visibleItems = useMemo(() => items.slice(startIndex), [items, startIndex]);
  const hiddenCount = startIndex;
  const showMore = () => setCount((prev) => Math.min(total, prev + pageSize));

  return { visibleItems, hiddenCount, showMore };
}
