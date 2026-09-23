import { lazy, memo, Suspense } from 'react';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';

export { linkCitationMarkers } from '@/lib/markdown/citations';
export type { MarkdownCitationSource } from '@/lib/markdown/citations';

// react-markdown plus the remark/rehype/micromark chain is ~70 kB gz and nothing
// on first paint needs it. React.lazy is used instead of `lazyClient` because the
// fallback has to see `content` to show the raw text while the chunk loads.
const loadRenderer = () => import('@/components/markdown/MarkdownRenderer');
const MarkdownRenderer = lazy(() =>
  loadRenderer().then((mod) => ({
    default: mod.MarkdownRenderer,
  })),
);

/** Starts fetching the renderer early: most visits open on a chat to render. */
export function preloadMarkdown() {
  loadRenderer().catch(() => undefined);
}

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
    // The raw text waits a moment before it shows, so a quick load goes
    // straight to the rendered page instead of flashing its markdown.
    <Suspense
      fallback={<div className="markdown markdown-fallback whitespace-pre-wrap">{content}</div>}
    >
      <MarkdownRenderer content={content} sources={sources} streaming={streaming} />
    </Suspense>
  );
});
