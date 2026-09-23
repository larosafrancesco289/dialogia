import { useEffect, type DependencyList } from 'react';

export function useAutogrowTextarea(
  ref: React.RefObject<HTMLTextAreaElement>,
  deps: DependencyList = [],
  maxHeight = 200,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const limit = Number.isFinite(maxHeight) ? Math.max(120, maxHeight) : 200;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, limit) + 'px';
    };
    fit();
    // Text rewraps when the column changes width (a side panel opening, the
    // window resizing), so refit then too. Only width matters: fitting sets
    // the height, which must not retrigger the observer.
    if (typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, maxHeight]);
}
