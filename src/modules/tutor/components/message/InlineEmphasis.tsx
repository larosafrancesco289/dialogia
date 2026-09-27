import { Markdown } from '@/components/Markdown';

/**
 * A line the model wrote into a question, an option, a topic name or a note,
 * set the way a reply would set it: emphasis, code and maths render, escapes
 * read as their character, and nothing becomes a paragraph or a link.
 */
export function InlineEmphasis({ text }: { text: string }) {
  return <Markdown content={text} inline />;
}
