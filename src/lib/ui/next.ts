import type { UIState, UINextOverrides } from '@/lib/store/types';

const mergeNested = <T extends Record<string, unknown>>(current?: T, patch?: T): T | undefined => {
  if (!patch) return current;
  const base = current || {};
  const next = { ...base, ...patch };
  const entries = Object.entries(next).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as T) : undefined;
};

const pruneNext = (next: UINextOverrides): UINextOverrides | undefined => {
  const cleaned: UINextOverrides = {
    ...next,
    search: mergeNested(next.search),
    reasoning: mergeNested(next.reasoning),
    show: mergeNested(next.show),
  };
  const entries = Object.entries(cleaned).filter(([, value]) => value !== undefined);
  return entries.length ? (Object.fromEntries(entries) as UINextOverrides) : undefined;
};

export const readNextOverrides = (ui: UIState): UINextOverrides => ui.overrides ?? {};

export const applyNextOverrides = (ui: UIState, patch: Partial<UINextOverrides>): UIState => {
  const current = readNextOverrides(ui);
  const merged: UINextOverrides = {
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
  };
};
