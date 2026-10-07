// Module: tutor lib text
import { getLocale } from '@/lib/i18n/state';
import { t } from '@/modules/tutor/i18n';
import { formatNumber } from '@/lib/i18n/format';
// Responsibility: joining the tutor's own words (goals, notes, reasons) into the interface's
// sentences, so text that already ends in punctuation never ends twice.

// A sentence has ended when its last word is followed by . ! ? or an ellipsis,
// possibly inside a closing quote or bracket: `...describe?"` has ended.
const ENDED = /[.!?…]["'”’)\]]*$/;

/** Text without its closing punctuation, to quote it or carry on after it. */
export const withoutEnd = (text: string) => text.trim().replace(/[\s.!?;:,…]+$/, '');

/** Text as one sentence: trimmed, and ending once (its own ! or ? kept). */
export function asSentence(text: string): string {
  const clean = text.trim().replace(/[\s;:,]+$/, '');
  if (!clean) return '';
  return ENDED.test(clean) ? clean : `${clean}.`;
}

/** Sentences joined with single spaces, each ending exactly once; empty parts drop out. */
export function joinSentences(...parts: Array<string | undefined | null | false>): string {
  return parts
    .map((part) => (part ? asSentence(part) : ''))
    .filter(Boolean)
    .join(' ');
}

/**
 * A mistaken belief the tutor noted, framed as the learner's idea, so a skim never
 * reads it as fact: "A vaccine kills the germ" becomes "You thought a vaccine kills
 * the germ". The tutor is asked to write it that way; older notes get the frame here.
 */
export function asTheirIdea(belief: string): string {
  const text = asSentence(belief);
  if (!text || /^you\b/i.test(text)) return text;
  // Already framed in the language shown ("Pensavi che…"): the tutor wrote it so.
  const frame = t('idea.youThought', { belief: '' }).trim();
  if (fold(text).startsWith(fold(frame))) return text;
  // Lowercase a plain first word ("A", "Vaccines"), never "I" or an acronym like
  // "DNA", nor a German noun, which keeps its capital.
  const lower = getLocale() !== 'de' && /^(?!I\b)\p{Lu}(?!\p{Lu})/u.test(text);
  return t('idea.youThought', {
    belief: lower ? text.charAt(0).toLocaleLowerCase() + text.slice(1) : text,
  });
}

/** Lower case without accents, for comparing words written either way. */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

/** A count in words, as prose sets small numbers: "four", then digits past twenty. */
/** "two" in English, where the app spells small numbers out; a numeral in any other language. */
export const countWord = (n: number) =>
  getLocale() === 'en' && n >= 1 && n <= NUMBER_WORDS.length
    ? NUMBER_WORDS[n - 1]
    : formatNumber(n);
