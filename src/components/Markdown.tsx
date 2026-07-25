'use client';
import { lazy, memo, Suspense } from 'react';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';

export { linkCitationMarkers } from '@/lib/markdown/citations';
export type { MarkdownCitationSource } from '@/lib/markdown/citations';

// react-markdown plus the remark/rehype/micromark chain is ~70 kB gz and nothing
// on first paint needs it. React.lazy is used instead of `lazyClient` because the
// fallback has to see `content` to show the raw text while the chunk loads.
const MarkdownRenderer = lazy(() =>
  import('@/components/markdown/MarkdownRenderer').then((mod) => ({
    default: mod.MarkdownRenderer,
  })),
);

export const Markdown = memo(function Markdown({
  content,
  sources,
  streaming,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
  /** True while this block's content may still change on the next flush. */
  streaming?: boolean;
}) {
  return (
    <Suspense fallback={<div className="markdown whitespace-pre-wrap">{content}</div>}>
      <MarkdownRenderer content={content} sources={sources} streaming={streaming} />
    </Suspense>
  );
});
