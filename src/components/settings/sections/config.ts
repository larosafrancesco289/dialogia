import type { TabId, SectionId } from '@/components/settings/types';

export const TAB_LIST: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'models-routing', label: 'Models' },
  { id: 'chat', label: 'Chat' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'advanced', label: 'Advanced' },
];

export const TAB_SECTIONS: Record<TabId, SectionId[]> = {
  'models-routing': ['models'],
  chat: ['general', 'reasoning'],
  tutor: ['tutor'],
  appearance: ['display', 'theme', 'privacy'],
  advanced: ['data'],
};

export const SECTION_TITLES: Record<SectionId, string> = {
  models: 'Models',
  general: 'General',
  reasoning: 'Reasoning',
  tutor: 'Tutor',
  display: 'Display',
  theme: 'Theme',
  privacy: 'Privacy',
  data: 'Data',
};
