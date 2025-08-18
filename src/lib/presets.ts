import { kvGet, kvSet } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export type SystemPreset = {
  id: string;
  name: string;
  system: string;
};

const KEY = 'system-presets-v1';

export async function getSystemPresets(): Promise<SystemPreset[]> {
  const list = (await kvGet<SystemPreset[]>(KEY)) || [];
  // Basic sanity filter in case of stale data
  return list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string');
}

export async function setSystemPresets(list: SystemPreset[]): Promise<void> {
  await kvSet<SystemPreset[]>(KEY, list);
}

export async function addSystemPreset(name: string, system: string): Promise<SystemPreset> {
  const trimmed = name.trim();
  const preset: SystemPreset = { id: uuidv4(), name: trimmed || 'Untitled', system };
  const current = await getSystemPresets();
  const next = [...current, preset];
  await setSystemPresets(next);
  return preset;
}

export async function updateSystemPreset(
  id: string,
  updates: Partial<Pick<SystemPreset, 'name' | 'system'>>,
): Promise<SystemPreset | undefined> {
  const current = await getSystemPresets();
  const idx = current.findIndex((p) => p.id === id);
  if (idx === -1) return undefined;
  const updated: SystemPreset = { ...current[idx], ...updates };
  const next = current.slice();
  next[idx] = updated;
  await setSystemPresets(next);
  return updated;
}

export async function deleteSystemPreset(id: string): Promise<void> {
  const current = await getSystemPresets();
  const next = current.filter((p) => p.id !== id);
  await setSystemPresets(next);
}

