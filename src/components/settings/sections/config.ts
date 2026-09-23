import type { TabId, SectionId } from '@/components/settings/types';

export const TAB_LIST: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'connections', label: 'Connections' },
  { id: 'models', label: 'Models' },
  { id: 'chat', label: 'Chat' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'data', label: 'Data' },
];

export const TAB_SECTIONS: Record<TabId, SectionId[]> = {
  connections: ['providers', 'endpoints', 'web-search'],
  models: ['default-model', 'favorites', 'privacy'],
  chat: ['general', 'reasoning'],
  tutor: ['tutor'],
  appearance: ['theme', 'display'],
  data: ['data'],
};

export const SECTION_TITLES: Record<SectionId, string> = {
  providers: 'Providers',
  endpoints: 'Your servers',
  'web-search': 'Web search',
  'default-model': 'Default model',
  favorites: 'Favorites',
  privacy: 'Privacy',
  general: 'System prompt',
  reasoning: 'Reasoning',
  tutor: 'Tutor',
  theme: 'Theme',
  display: 'Display',
  data: 'Import and export',
};

/** What each section is about, so search finds it by its contents too. */
export const SECTION_KEYWORDS: Record<SectionId, string> = {
  providers: 'openrouter anthropic api key provider connect',
  endpoints: 'local server ollama lm studio llama.cpp vllm base url custom endpoint',
  'web-search': 'tavily search key browse web',
  'default-model': 'new chat default model refresh list',
  favorites: 'favorite favourite star models add remove hidden picker',
  privacy: 'zdr zero data retention privacy providers store',
  general: 'system prompt preset instructions timestamps date time',
  reasoning: 'reasoning effort thinking tokens budget',
  tutor: 'tutor learning plan learner model teaching',
  theme: 'theme dark light auto color colour scheme',
  display: 'thinking stats colophon display',
  data: 'export import json backup data',
};

/** Whether a section answers a settings search (title or contents, every word). */
export function sectionMatches(sectionId: SectionId, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = `${SECTION_TITLES[sectionId]} ${SECTION_KEYWORDS[sectionId]}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
