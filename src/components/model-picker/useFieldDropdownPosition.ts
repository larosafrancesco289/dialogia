import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export type FieldDropdownPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

const MARGIN = 12;
const GAP = 8;
const MIN_HEIGHT = 220;
const MAX_UPWARD_HEIGHT = 400;

function placeDropdown(rect: DOMRect, viewportHeight: number): FieldDropdownPosition {
  const spaceBelow = viewportHeight - rect.bottom - MARGIN;
  const spaceAbove = rect.top - MARGIN;
  // Open upward if not enough space below but more space above
  if (spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow) {
    const maxHeight = Math.min(Math.max(MIN_HEIGHT, spaceAbove - GAP), MAX_UPWARD_HEIGHT);
    return { left: rect.left, top: rect.top - GAP - maxHeight, width: rect.width, maxHeight };
  }
  const top = rect.bottom + GAP;
  const maxHeight = Math.max(MIN_HEIGHT, viewportHeight - top - MARGIN);
  return { left: rect.left, top, width: rect.width, maxHeight };
}

/**
 * Where a field's fixed-position results list goes: under the field, or
 * above it when the space below is short. Placed again whenever `query`
 * changes and on any resize or scroll while it is non-empty; null while it
 * is empty.
 */
export function useFieldDropdownPosition(fieldRef: RefObject<HTMLElement | null>, query: string) {
  const [position, setPosition] = useState<FieldDropdownPosition | null>(null);

  const place = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    setPosition(placeDropdown(el.getBoundingClientRect(), window.innerHeight));
  }, [fieldRef]);

  useLayoutEffect(() => {
    if (!query) {
      setPosition(null);
      return;
    }
    place();
  }, [query, place]);

  useEffect(() => {
    if (!query) return;
    window.addEventListener('resize', place, true);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place, true);
      window.removeEventListener('scroll', place, true);
    };
  }, [query, place]);

  return [position, setPosition] as const;
}
