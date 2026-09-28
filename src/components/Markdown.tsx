import { lazy, memo, Suspense, useEffect } from 'react';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';
import { markdownToPlainText } from '@/lib/markdown/plainText';
import { hasMathDelimiter, preprocessMarkdown } from '@/lib/markdown/preprocess';
import { preloadKatex } from '@/components/markdown/loadKatex';

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
function MarkdownFallback({ content, inline }: { content: string; inline?: boolean }) {
  if (inline) return <span>{markdownToPlainText(content)}</span>;
  return (
    <div className="markdown markdown-fallback whitespace-pre-wrap" dir="auto">
      {markdownToPlainText(content)}
    </div>
  );
}

export const Markdown = memo(function Markdown({
  content,
  sources,
  streaming,
  inline,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
  /** True while this block's content may still change on the next flush. */
  streaming?: boolean;
  /** A single line set inside other text, without paragraphs or links. */
  inline?: boolean;
}) {
  // KaTeX is fetched from the first text that holds maths, streaming or from
  // history, without waiting for the renderer's own chunk. Most text has no
  // dollar or backslash at all and skips the full check.
  const holdsMath = /[$\\]/.test(content) && hasMathDelimiter(preprocessMarkdown(content));
  useEffect(() => {
    if (holdsMath) preloadKatex();
  }, [holdsMath]);

  return (
    // The text waits a moment before it shows, so a quick load goes straight
    // to the rendered page; a slow one shows prose without markdown syntax.
    <Suspense fallback={<MarkdownFallback content={content} inline={inline} />}>
      <MarkdownRenderer content={content} sources={sources} streaming={streaming} inline={inline} />
    </Suspense>
  );
});
