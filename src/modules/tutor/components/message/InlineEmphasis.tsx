import { Fragment, type ReactNode } from 'react';

// **strong**, then *em* or _em_; the markers must hug the words, so a lone
// asterisk ("5 * 3") or a snake_case name is left as it is.
const EMPHASIS = /\*\*(\S(?:[^*]*?\S)?)\*\*|\*(\S(?:[^*]*?\S)?)\*|\b_(\S(?:[^_]*?\S)?)_\b/g;

/**
 * The emphasis a model writes into a question or an option ("what do you
 * want to *do*"), set as emphasis instead of showing its asterisks. Only
 * emphasis: these are single lines, not markdown documents.
 */
export function InlineEmphasis({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(EMPHASIS)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    const [, strong, em, underscored] = match;
    parts.push(
      strong ? <strong key={index}>{strong}</strong> : <em key={index}>{em ?? underscored}</em>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}
