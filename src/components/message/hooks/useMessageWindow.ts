import { useEffect, useMemo, useState } from 'react';

export function useMessageWindow<T>(items: T[], opts?: { pageSize?: number; resetKey?: unknown }) {
  const pageSize = opts?.pageSize ?? 150;
  const total = items.length;
  const [count, setCount] = useState(pageSize);

  useEffect(() => {
    setCount(pageSize);
  }, [pageSize, opts?.resetKey]);

  useEffect(() => {
    setCount((prev) => {
      const next = Math.min(total, Math.max(pageSize, prev));
      return next === prev ? prev : next;
    });
  }, [total, pageSize]);

  const startIndex = Math.max(0, total - count);
  const visibleItems = useMemo(() => items.slice(startIndex), [items, startIndex]);
  const hiddenCount = startIndex;
  const showMore = () => setCount((prev) => Math.min(total, prev + pageSize));

  return { visibleItems, hiddenCount, showMore };
}
