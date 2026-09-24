// Module: tutor lib text
// Responsibility: joining the tutor's own words (goals, notes, reasons) into the interface's
// sentences, so text that already ends in punctuation never ends twice.

// Topic names are title-like; mid-sentence, a leading article reads lower.
export const inSentence = (name: string) =>
  name.replace(/^(The|A|An) /, (article) => article.toLowerCase());

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
