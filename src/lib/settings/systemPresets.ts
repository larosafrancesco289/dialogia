import {
  addSystemPreset,
  deleteSystemPreset,
  getSystemPresets,
  updateSystemPreset,
  type SystemPreset,
} from '@/lib/presets';

const sortPresetsByName = (list: SystemPreset[]): SystemPreset[] =>
  list.slice().sort((a, b) => a.name.localeCompare(b.name));

export async function loadSystemPresets(): Promise<SystemPreset[]> {
  return sortPresetsByName(await getSystemPresets());
}

export async function saveSystemPreset(name: string, system: string): Promise<SystemPreset> {
  return addSystemPreset(name, system);
}

export async function renameSystemPreset(id: string, name: string): Promise<void> {
  await updateSystemPreset(id, { name });
}

export async function removeSystemPreset(id: string): Promise<void> {
  await deleteSystemPreset(id);
}
