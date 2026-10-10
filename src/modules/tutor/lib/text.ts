// Module: tutor lib text
// Responsibility: joining the tutor's own words (goals, notes, reasons) into the interface's
// sentences, so text that already ends in punctuation never ends twice.

import { getLocale } from '@/lib/i18n/state';
import { t } from '@/modules/tutor/i18n';
import { formatNumber } from '@/lib/i18n/format';

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
  // Already framed in the language shown ("Pensavi che…"): the tutor wrote it so,
  // perhaps in another tense ("Νόμισες ότι" beside the frame's "Νόμιζες ότι").
  const frame = t('idea.youThought', { belief: '' }).replace(/[\s:,.]+$/u, '');
  if (fold(text).startsWith(fold(frame)) || ALREADY_FRAMED.test(fold(text))) return text;
  // Lowercase a plain first word ("A", "Vaccines"), never "I" or an acronym like
  // "DNA", nor a German noun, which keeps its capital.
  const lower = getLocale() !== 'de' && /^(?!I\b)\p{Lu}(?!\p{Lu})/u.test(text);
  return t('idea.youThought', {
    belief: lower ? text.charAt(0).toLocaleLowerCase() + text.slice(1) : text,
  });
}

/**
 * Openings that already say "you thought", in the app's languages and their
 * usual tenses, folded (lower case, no accents). English is caught by "you".
 */
const ALREADY_FRAMED = new RegExp(
  '^(' +
    [
      'pensavi',
      'hai pensato',
      'credevi',
      'hai creduto',
      'tu pensais',
      'tu as pense',
      'tu croyais',
      'tu as cru',
      'pensabas',
      'pensaste',
      'creias',
      'creiste',
      'du dachtest',
      'du hast gedacht',
      'du glaubtest',
      'du hast geglaubt',
      'voce achava',
      'voce achou',
      'voce pensava',
      'voce pensou',
      'voce acreditava',
      'νομιζες',
      'νομισες',
      'πιστευες',
      'πιστεψες',
      'σκεφτηκες',
    ].join('|') +
    ')(?![\\p{L}])',
  'u',
);

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

/**
 * A count as prose sets it: in English small numbers in words ("four"), then
 * digits past twenty; a numeral in any other language.
 */
export const countWord = (n: number) =>
  getLocale() === 'en' && n >= 1 && n <= NUMBER_WORDS.length
    ? NUMBER_WORDS[n - 1]
    : formatNumber(n);
