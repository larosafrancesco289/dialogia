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
  chat: ['general', 'memory', 'reasoning'],
  tutor: ['tutor'],
  appearance: ['theme', 'display', 'developer'],
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
  memory: 'Memory',
  reasoning: 'Thinking',
  tutor: 'Tutor',
  theme: 'Theme',
  display: 'Display',
  developer: 'Developer',
  data: 'Import and export',
};

/**
 * What each section shows (its labels) and is about, so search finds it by
 * the words on screen as well as by its title.
 */
export const SECTION_KEYWORDS: Record<SectionId, string> = {
  providers: 'openrouter key anthropic key api provider connect replace remove',
  endpoints:
    'your own server local ollama lm studio llama.cpp vllm server address base url custom endpoint openai compatible key api model names test connection tools images thinking effort reply costs prompt caching chat titles remove self-hosted',
  'web-search': 'tavily key search browse web openrouter search jina reader',
  'default-model': 'new chat default model reset refresh list',
  favorites: 'favorite favourite star models remove picker',
  privacy: 'zero data retention only zdr privacy providers prompts',
  general:
    'system prompt saved prompts choose a saved prompt preset save current rename delete message timestamps date time',
  memory:
    'use memory remember forget notes about you learning include sensitive topics private health open memory bookmark',
  reasoning: 'thinking effort thinking budget reasoning tokens level model default',
  tutor:
    'tutor mode always tutor follow the tutor scroll tutor model learning plan learner teaching',
  theme: 'theme color colour scheme light dark auto system',
  display: 'show thinking by default show reply details model speed cost stats colophon display',
  developer:
    'developer tool-call log request view include the raw json each reply debug inspect arguments result',
  data: 'import and export chats and settings json file backup data',
};

// Settings reopens on the tab last used in this page's life; a reload starts
// over on the first tab.
let lastTab: TabId | null = null;

export function initialSettingsTab(): TabId {
  return lastTab ?? TAB_LIST[0].id;
}

export function rememberSettingsTab(tab: TabId) {
  lastTab = tab;
}

/** Lower case, with punctuation as spaces: "Tool-call" and "tool call" read alike. */
const searchWords = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Whether a section answers a settings search: every word is in its title or contents. */
export function sectionMatches(sectionId: SectionId, query: string): boolean {
  const words = searchWords(query);
  if (!words.length) return true;
  const haystack = searchWords(`${SECTION_TITLES[sectionId]} ${SECTION_KEYWORDS[sectionId]}`).join(
    ' ',
  );
  return words.every((word) => haystack.includes(word));
}
