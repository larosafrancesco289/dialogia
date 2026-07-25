import type { TabId, SectionId } from '@/components/settings/types';

export const TAB_LIST: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'providers', label: 'Providers' },
  { id: 'models-routing', label: 'Models' },
  { id: 'chat', label: 'Chat' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'advanced', label: 'Advanced' },
];

export const TAB_SECTIONS: Record<TabId, SectionId[]> = {
  providers: ['providers', 'endpoints', 'web-search'],
  'models-routing': ['models'],
  chat: ['general', 'reasoning'],
  tutor: ['tutor'],
  appearance: ['display', 'theme', 'privacy'],
  advanced: ['data'],
};

export const SECTION_TITLES: Record<SectionId, string> = {
  providers: 'Providers',
  endpoints: 'Endpoints',
  'web-search': 'Web search',
  models: 'Models',
  general: 'General',
  reasoning: 'Reasoning',
  tutor: 'Tutor',
  display: 'Display',
  theme: 'Theme',
  privacy: 'Privacy',
  data: 'Data',
};
