import type { TabId, SectionId } from '@/components/settings/types';
import { t, type MessageKey } from '@/lib/i18n';
import en from '@/lib/i18n/messages/en';

export const TAB_LIST: ReadonlyArray<{ id: TabId; label: MessageKey }> = [
  { id: 'connections', label: 'settings.tab.connections' },
  { id: 'models', label: 'settings.tab.models' },
  { id: 'chat', label: 'settings.tab.chat' },
  { id: 'tutor', label: 'settings.tab.tutor' },
  { id: 'appearance', label: 'settings.tab.appearance' },
  { id: 'data', label: 'settings.tab.data' },
];

export const TAB_SECTIONS: Record<TabId, SectionId[]> = {
  connections: ['providers', 'endpoints', 'web-search'],
  models: ['default-model', 'favorites', 'privacy'],
  chat: ['general', 'memory', 'reasoning'],
  tutor: ['tutor'],
  appearance: ['theme', 'language', 'display', 'developer'],
  data: ['data'],
};

/** A section's title in the language shown. */
export const sectionTitle = (sectionId: SectionId) => t(`settings.section.${sectionId}`);

// Settings reopens on the tab last used in this page's life; a reload starts
// over on the first tab.
let lastTab: TabId | null = null;

export function initialSettingsTab(): TabId {
  return lastTab ?? TAB_LIST[0].id;
}

export function rememberSettingsTab(tab: TabId) {
  lastTab = tab;
}

/**
 * Lower case without accents, punctuation as spaces: "Tool-call" and "tool
 * call" read alike, and "modèle" finds "modele". Any script's letters count.
 */
const searchWords = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Whether a section answers a settings search: every word is in its title or
 * what it shows (`settings.keywords.*`), in the language shown or in English,
 * so words learnt from the English app still find their place.
 */
export function sectionMatches(sectionId: SectionId, query: string): boolean {
  const words = searchWords(query);
  if (!words.length) return true;
  const title = `settings.section.${sectionId}` as const;
  const keywords = `settings.keywords.${sectionId}` as const;
  const haystack = searchWords([t(title), t(keywords), en[title], en[keywords]].join(' ')).join(
    ' ',
  );
  return words.every((word) => haystack.includes(word));
}
