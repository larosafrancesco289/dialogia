import { lazy, memo, Suspense } from 'react';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';
import { markdownToPlainText } from '@/lib/markdown/plainText';

export { linkCitationMarkers } from '@/lib/markdown/citations';
export type { MarkdownCitationSource } from '@/lib/markdown/citations';

// react-markdown plus the remark/rehype/micromark chain is ~70 kB gz and nothing
// on first paint needs it. React.lazy is used instead of `lazyClient` because the
// fallback has to see `content` to show the text while the chunk loads.
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

// Its own component, so the text is only stripped when the fallback shows.
function MarkdownFallback({ content }: { content: string }) {
  return (
    <div className="markdown markdown-fallback whitespace-pre-wrap">
      {markdownToPlainText(content)}
    </div>
  );
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
    // The text waits a moment before it shows, so a quick load goes straight
    // to the rendered page; a slow one shows prose without markdown syntax.
    <Suspense fallback={<MarkdownFallback content={content} />}>
      <MarkdownRenderer content={content} sources={sources} streaming={streaming} />
    </Suspense>
  );
});
