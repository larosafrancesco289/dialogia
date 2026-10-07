// Module: i18n/locales
// Responsibility: The languages the app speaks, each named in its own words, and
// how a preference ("Auto" or one of them) becomes the language actually shown.

export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'el', name: 'Ελληνικά' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

/** What the person chose: follow the browser's languages, or one language. */
export type LanguagePreference = 'auto' | Locale;

export const SOURCE_LOCALE: Locale = 'en';

const CODES: readonly string[] = LOCALES.map((locale) => locale.code);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && CODES.includes(value);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || isLocale(value);
}

const baseOf = (tag: string) => tag.toLowerCase().split('-')[0];

/**
 * The first of the browser's languages the app speaks: an exact tag first
 * ("pt-BR"), then the language alone ("de-AT" reads German, "pt-PT" the
 * Brazilian Portuguese we have). English when none is spoken here.
 */
export function matchLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const exact = LOCALES.find((locale) => locale.code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.code;
    const base = LOCALES.find((locale) => baseOf(locale.code) === baseOf(tag));
    if (base) return base.code;
  }
  return SOURCE_LOCALE;
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

export function resolveLanguage(
  preference: LanguagePreference | undefined,
  tags: readonly string[] = browserLanguages(),
): Locale {
  if (preference && preference !== 'auto') return preference;
  return matchLocale(tags);
}

/** "Italiano", "Ελληνικά": a language is offered under its own name. */
export function nativeName(locale: Locale): string {
  return LOCALES.find((entry) => entry.code === locale)?.name ?? locale;
}

/** The language's name in English, for the model (prompts stay in English). */
export function englishName(locale: Locale): string {
  return new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
}
