// Module: i18n/catalogue
// Responsibility: A typed message catalogue. English is the source and is
// bundled; every other language is a lazily loaded chunk whose type is derived
// from the English one, so a missing key, an extra key, or a plural written as
// a plain string fails the type check. Placeholders are `{name}`; a message
// with forms per number is an object chosen by Intl.PluralRules on `count`.

import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locales';
import { getLocale, intlLocale, registerCatalogue, subscribeLocale } from '@/lib/i18n/state';
import { formatNumber } from '@/lib/i18n/format';

export type PluralMessage = {
  readonly zero?: string;
  readonly one?: string;
  readonly two?: string;
  readonly few?: string;
  readonly many?: string;
  readonly other: string;
};

type MessageValue = string | PluralMessage;
export type MessageSource = { readonly [key: string]: MessageValue };

/** Another language's catalogue: the same keys, a string where English has one, forms where it has forms. */
export type Translation<S extends MessageSource> = {
  readonly [K in keyof S]: S[K] extends string ? string : PluralMessage;
};

type PlaceholdersIn<S> = S extends `${string}{${infer P}}${infer Rest}`
  ? P | PlaceholdersIn<Rest>
  : never;

type PlaceholdersOf<M> = M extends string
  ? PlaceholdersIn<M>
  : M extends PluralMessage
    ? 'count' | PlaceholdersIn<Exclude<M[keyof M], undefined>>
    : never;

type ParamsOf<M, V> = { readonly [P in PlaceholdersOf<M>]: P extends 'count' ? number : V };

type ArgsOf<M, V> = [PlaceholdersOf<M>] extends [never] ? [] : [params: ParamsOf<M, V>];

// Per key, so a key chosen at run time (one of a set) takes what any of them takes.
type ArgsFor<S extends MessageSource, K extends keyof S, V> = K extends unknown
  ? ArgsOf<S[K], V>
  : never;

export type Translate<S extends MessageSource> = {
  <K extends keyof S & string>(key: K, ...args: ArgsFor<S, K, string | number>): string;
  /** The same message with elements in its placeholders (a link, a key cap, bold words). */
  rich<K extends keyof S & string>(key: K, ...args: ArgsFor<S, K, ReactNode>): ReactNode;
};

type Loaders<S extends MessageSource> = {
  readonly [L in Exclude<Locale, 'en'>]: () => Promise<{ default: Translation<S> }>;
};

const pluralRules = new Map<string, Intl.PluralRules>();

function pluralForm(message: PluralMessage, count: number): string {
  const tag = intlLocale();
  let rules = pluralRules.get(tag);
  if (!rules) {
    rules = new Intl.PluralRules(tag);
    pluralRules.set(tag, rules);
  }
  return message[rules.select(count) as keyof PluralMessage] ?? message.other;
}

const PLACEHOLDER = /\{(\w+)\}/g;

function display(value: unknown): unknown {
  return typeof value === 'number' ? formatNumber(value) : value;
}

/** The message's text with its placeholders filled; an unknown name is left as written. */
function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) =>
    name in params ? String(display(params[name])) : whole,
  );
}

function interpolateRich(template: string, params?: Record<string, unknown>): ReactNode {
  if (!params) return template;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const [whole, name] = match;
    const at = match.index ?? 0;
    if (at > last) parts.push(template.slice(last, at));
    parts.push(
      name in params
        ? createElement(Fragment, { key: parts.length }, display(params[name]) as ReactNode)
        : whole,
    );
    last = at + whole.length;
  }
  if (last < template.length) parts.push(template.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

export type Catalogue<S extends MessageSource> = {
  /** In the language now shown; for code outside React and for event handlers. */
  t: Translate<S>;
  /** The same, re-rendering the component when the language changes. */
  useT: () => Translate<S>;
  /** Every key with its English text, for the tests. */
  source: S;
  /** Load one language's table (the tests read every language this way). */
  load: (locale: Locale) => Promise<Translation<S>>;
};

export function defineCatalogue<S extends MessageSource>(
  source: S,
  loaders: Loaders<S>,
): Catalogue<S> {
  const tables: Partial<Record<Locale, Translation<S>>> = { en: source as Translation<S> };

  const load = async (locale: Locale): Promise<Translation<S>> => {
    const have = tables[locale];
    if (have) return have;
    const table = (await loaders[locale as Exclude<Locale, 'en'>]()).default;
    tables[locale] = table;
    return table;
  };
  registerCatalogue({ load: async (locale) => void (await load(locale)) });

  const messageFor = (key: string, params?: Record<string, unknown>): string => {
    const value = (tables[getLocale()] as MessageSource | undefined)?.[key] ?? source[key];
    if (value === undefined) return key;
    if (typeof value === 'string') return value;
    return pluralForm(value, Number(params?.count ?? 0));
  };

  const build = (): Translate<S> => {
    const translate = ((key: string, params?: Record<string, unknown>) =>
      interpolate(messageFor(key, params), params)) as unknown as Translate<S>;
    translate.rich = ((key: string, params?: Record<string, unknown>) =>
      interpolateRich(messageFor(key, params), params)) as Translate<S>['rich'];
    return translate;
  };

  // One function per language, so a component's memo sees the language change.
  const byLocale = new Map<Locale, Translate<S>>();
  const forLocale = (locale: Locale) => {
    let translate = byLocale.get(locale);
    if (!translate) {
      translate = build();
      byLocale.set(locale, translate);
    }
    return translate;
  };

  return {
    t: build(),
    useT: () => forLocale(useLocale()),
    source,
    load,
  };
}

/** The language now shown, re-rendering when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, getLocale);
}
