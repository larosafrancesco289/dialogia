import type { TabId } from '@/components/settings/types';

export const TAB_LIST: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'models', label: 'Models' },
  { id: 'chat', label: 'Chat' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'display', label: 'Display' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'data', label: 'Data' },
  { id: 'labs', label: 'Labs' },
];

export const TAB_SECTIONS: Record<TabId, string[]> = {
  models: ['models', 'web-search', 'routing'],
  chat: ['general', 'generation', 'reasoning'],
  tutor: ['tutor'],
  display: ['display', 'debug'],
  privacy: ['privacy'],
  data: ['data'],
  labs: ['experimental'],
};

export const SECTION_TITLES: Record<string, string> = {
  models: 'Models',
  'web-search': 'Web Search',
  routing: 'Routing',
  general: 'General',
  generation: 'Generation',
  reasoning: 'Reasoning',
  tutor: 'Tutor',
  display: 'Display',
  debug: 'Debug',
  privacy: 'Privacy',
  data: 'Data',
  experimental: 'Experimental',
};
