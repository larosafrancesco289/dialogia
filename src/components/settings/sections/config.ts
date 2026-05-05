import type { TabId, SectionId } from '@/components/settings/types';

export const TAB_LIST: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'models-routing', label: 'Models & Routing' },
  { id: 'chat', label: 'Chat' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'advanced', label: 'Advanced' },
];

export const TAB_SECTIONS: Record<TabId, SectionId[]> = {
  'models-routing': ['models', 'web-search', 'routing'],
  chat: ['general', 'generation', 'reasoning'],
  tutor: ['tutor'],
  appearance: ['display', 'theme', 'privacy'],
  advanced: ['data', 'developer', 'usage-stats'],
};

export const SECTION_TITLES: Record<SectionId, string> = {
  models: 'Models',
  'web-search': 'Web Search',
  routing: 'Routing',
  general: 'General',
  generation: 'Generation',
  reasoning: 'Reasoning',
  tutor: 'Tutor',
  display: 'Display',
  theme: 'Theme',
  privacy: 'Privacy',
  data: 'Data',
  developer: 'Developer',
  'usage-stats': 'Usage Statistics',
};
