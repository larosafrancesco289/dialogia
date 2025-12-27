import type { UiNextOverrides, UiSnapshot } from '@/lib/contracts/ui';

const mergeNested = <T extends Record<string, unknown>>(current?: T, patch?: T): T | undefined => {
  if (!patch) return current;
  const base = current || {};
  const next = { ...base, ...patch };
  const entries = Object.entries(next).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

const pruneNext = (next: UiNextOverrides): UiNextOverrides | undefined => {
  const cleaned: UiNextOverrides = {
    ...next,
    search: mergeNested(next.search),
    reasoning: mergeNested(next.reasoning),
    show: mergeNested(next.show),
  };
  const entries = Object.entries(cleaned).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as UiNextOverrides) : undefined;
};

export const readNextOverrides = (ui: UiSnapshot): UiNextOverrides => ui.overrides ?? {};

export const applyNextOverrides = <T extends UiSnapshot>(
  ui: T,
  patch: Partial<UiNextOverrides>,
): T => {
  const current = readNextOverrides(ui);
  const merged: UiNextOverrides = {
    ...current,
    ...patch,
    search: mergeNested(current.search, patch.search),
    reasoning: mergeNested(current.reasoning, patch.reasoning),
    show: mergeNested(current.show, patch.show),
  };

  const nextValue = pruneNext(merged);
  return {
    ...ui,
    overrides: nextValue,
  } as T;
};
