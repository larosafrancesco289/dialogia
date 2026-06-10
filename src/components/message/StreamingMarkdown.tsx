'use client';

import { useMemo } from 'react';
import { Markdown, type MarkdownCitationSource } from '@/components/Markdown';
import { splitMarkdownBlocks } from '@/lib/markdown/blocks';

/**
 * Streaming renderer that splits content into completed blocks plus a growing
 * tail. Completed blocks are memoized `<Markdown>` instances whose content
 * never changes, so each stream flush only re-parses the trailing block
 * instead of the whole document. The final (non-streaming) render in
 * AssistantMessage falls back to a single full-document `<Markdown>`, so any
 * block boundary is transient.
 */
export function StreamingMarkdown({
  content,
  sources,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
}) {
  const { stable, tail } = useMemo(() => splitMarkdownBlocks(content), [content]);
  if (!content) return null;
  return (
    <>
      {stable.map((block, index) => (
        <Markdown key={index} content={block} sources={sources} streaming />
      ))}
      {tail && <Markdown content={tail} sources={sources} streaming />}
    </>
  );
}
