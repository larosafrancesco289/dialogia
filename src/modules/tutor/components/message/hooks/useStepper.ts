import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Where a card opens: on its first unanswered item, or on its last when every
 * item is answered (so a reload shows where the learner left off, not item 1).
 * -1 when there are no items.
 */
export function resumeIndex<T>(items: T[], isPending: (item: T, index: number) => boolean): number {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item && isPending(item, i)) return i;
  }
  return items.length - 1;
}

export function useStepper<T>(items: T[], isPending: (item: T, index: number) => boolean) {
  const total = items.length;
  const firstPendingIndex = useMemo(() => resumeIndex(items, isPending), [items, isPending]);

  const [activeIndex, setActiveIndex] = useState(() =>
    firstPendingIndex >= 0 ? firstPendingIndex : 0,
  );

  useEffect(() => {
    if (total === 0) return;
    if (activeIndex < total) return;
    setActiveIndex(Math.max(total - 1, 0));
  }, [total, activeIndex]);

  useEffect(() => {
    if (total === 0) return;
    const active = items[activeIndex];
    if (active) return;
    if (firstPendingIndex >= 0) {
      setActiveIndex(firstPendingIndex);
    } else if (total > 0) {
      setActiveIndex((prev) => Math.min(prev, total - 1));
    }
  }, [items, total, activeIndex, firstPendingIndex]);

  const goToIndex = useCallback(
    (idx: number) => {
      if (!Number.isFinite(idx)) return;
      setActiveIndex((prev) => {
        if (!total) return prev;
        if (idx < 0) return 0;
        if (idx >= total) return total - 1;
        return idx;
      });
    },
    [total],
  );

  const goPrevious = useCallback(() => goToIndex(activeIndex - 1), [activeIndex, goToIndex]);
  const goNext = useCallback(() => goToIndex(activeIndex + 1), [activeIndex, goToIndex]);

  const activeItem = total > 0 ? items[Math.min(activeIndex, total - 1)] : null;

  return {
    total,
    firstPendingIndex,
    activeIndex,
    setActiveIndex,
    goToIndex,
    goPrevious,
    goNext,
    activeItem,
  };
}
