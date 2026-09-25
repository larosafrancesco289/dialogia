import { useMemo } from 'react';
import { Markdown, type MarkdownCitationSource } from '@/components/Markdown';
import { markdownRenderBlocks } from '@/lib/markdown/blocks';

/**
 * A reply rendered block by block. Each block is a memoized `<Markdown>` keyed
 * by its index, so a stream flush re-parses only the block that changed (the
 * tail), and the end of the stream only tells each block it is finished: React
 * keeps every block it already rendered (a table's scroll, a selection, a
 * highlighted code block, typeset math) rather than rebuilding the reply.
 * AssistantMessage keeps a finished reply here unless `rendersAsBlocks` says it
 * must be parsed whole.
 */
export function StreamingMarkdown({
  content,
  sources,
  streaming,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
  /** True while the reply is still arriving. */
  streaming: boolean;
}) {
  const blocks = useMemo(() => markdownRenderBlocks(content), [content]);
  if (!content) return null;
  return (
    <>
      {blocks.map((block, index) => (
        <Markdown key={index} content={block} sources={sources} streaming={streaming} />
      ))}
    </>
  );
}
