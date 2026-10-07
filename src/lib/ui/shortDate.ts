import { formatDate } from '@/lib/i18n/format';

/**
 * "27 Sep" (or "Sep 27", "27 set", as the language writes it), with the year
 * when it is not this one; held together, so it never breaks across lines.
 */
export function shortDate(at: number): string {
  const thisYear = new Date(at).getFullYear() === new Date().getFullYear();
  const text = formatDate(
    at,
    thisYear
      ? { day: 'numeric', month: 'short' }
      : { day: 'numeric', month: 'short', year: 'numeric' },
  );
  return text.replace(/ /g, ' ');
}
