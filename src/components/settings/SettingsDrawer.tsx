'use client';
import { SettingsDrawerView } from '@/components/settings/SettingsDrawerView';
import { useSettingsDrawerState } from '@/components/settings/hooks/useSettingsDrawerState';

export function SettingsDrawer() {
  const state = useSettingsDrawerState();
  return <SettingsDrawerView {...state} />;
}
