// Module: i18n/format
// Responsibility: Numbers, money, percentages, dates, relative times and lists
// in the language shown, through Intl. Formatters are cached per locale and
// options, since building one is far slower than using it.

import { getLocale, intlLocale } from '@/lib/i18n/state';
import { listInProse } from '@/lib/utils/text';

const cache = new Map<string, unknown>();

function cached<T>(kind: string, options: object | undefined, make: (tag: string) => T): T {
  const tag = intlLocale();
  const id = `${kind}|${tag}|${options ? JSON.stringify(options) : ''}`;
  let formatter = cache.get(id) as T | undefined;
  if (!formatter) {
    formatter = make(tag);
    cache.set(id, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return cached('number', options, (tag) => new Intl.NumberFormat(tag, options)).format(value);
}

/** 0.42 → "42%" ("42 %" in French and German). */
export function formatPercent(fraction: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(fraction, { style: 'percent', maximumFractionDigits: 0, ...options });
}

export function formatDate(at: number | Date, options?: Intl.DateTimeFormatOptions): string {
  return cached('date', options, (tag) => new Intl.DateTimeFormat(tag, options)).format(at);
}

/**
 * "a, b and c" in the language shown ("a, b e c", "a, b und c"). The app's
 * English keeps its own house style, without the serial comma.
 */
export function formatList(
  items: readonly string[],
  type: Intl.ListFormatType = 'conjunction',
): string {
  if (type === 'conjunction' && getLocale() === 'en') return listInProse(items);
  return cached('list', { type }, (tag) => new Intl.ListFormat(tag, { type })).format(items);
}

/** The first letter in capitals, by the rules of the language shown. */
export function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLocaleUpperCase(intlLocale()) + text.slice(1);
}
