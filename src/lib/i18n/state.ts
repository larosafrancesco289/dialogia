// Module: i18n/state
// Responsibility: The one active language. Switching loads every registered
// catalogue's translation first, so no screen shows half one language and half
// the other, then tells the subscribers (React re-renders through `useT`).

import { browserLanguages, englishName, SOURCE_LOCALE, type Locale } from '@/lib/i18n/locales';

type Registered = { load: (locale: Locale) => Promise<void> };

const catalogues: Registered[] = [];
const listeners = new Set<() => void>();
let active: Locale = SOURCE_LOCALE;
let pending = 0;
let requested: Locale = SOURCE_LOCALE;
// Counts what subscribers were told: a language switch, or a catalogue's
// words for the shown language arriving after it, which leaves `active` as it was.
let version = 0;

export function registerCatalogue(catalogue: Registered): void {
  catalogues.push(catalogue);
  // A catalogue registered after a switch (a module's chunk arriving late)
  // still fetches the language already chosen.
  if (requested !== SOURCE_LOCALE) void catalogue.load(requested).then(notify, () => {});
}

export function getLocale(): Locale {
  return active;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the words shown may have changed, for React's snapshot. */
export function getLocaleVersion(): number {
  return version;
}

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

/**
 * Show `locale`. The translations arrive first; a switch overtaken by a later
 * one is dropped. A catalogue that fails to load (offline, a stale chunk) is
 * shown in English where it lacks words, never as keys.
 */
export async function setLocale(locale: Locale): Promise<void> {
  requested = locale;
  const ticket = ++pending;
  if (locale !== SOURCE_LOCALE) {
    await Promise.all(catalogues.map((catalogue) => catalogue.load(locale).catch(() => {})));
  }
  if (ticket !== pending) return;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (active === locale) return;
  active = locale;
  notify();
}

/**
 * The tag Intl formats with: the person's own regional variant of the shown
 * language when the browser has one ("en-GB" dates for English, "de-CH"
 * numbers for German), else the language itself.
 */
export function intlLocale(locale: Locale = active): string {
  const base = locale.split('-')[0];
  if (locale.includes('-')) return locale;
  const own = browserLanguages().find((tag) => tag.toLowerCase().split('-')[0] === base);
  return own ?? locale;
}

/**
 * The app's language named for a model ("Italian", "Brazilian Portuguese"),
 * or undefined in English. Prompts stay in English; one that writes words the
 * person reads in the app asks for them in this language.
 */
export function appLanguageForModel(): string | undefined {
  return active === SOURCE_LOCALE ? undefined : englishName(active);
}
