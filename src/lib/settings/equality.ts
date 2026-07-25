import type { ChatSettings } from '@/lib/types';

const shallowEqual = (a: Record<string, unknown>, b: Record<string, unknown>): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
};

export function settingsEqual(a: ChatSettings, b: ChatSettings): boolean {
  if (a === b) return true;
  if (a.modelId !== b.modelId) return false;
  if (a.system !== b.system) return false;
  if (!shallowEqual(a.generation, b.generation)) return false;
  if (!shallowEqual(a.ui, b.ui)) return false;
  if (!shallowEqual(a.features.search, b.features.search)) return false;
  if (!shallowEqual(a.features.tutor ?? {}, b.features.tutor ?? {})) return false;
  return true;
}
