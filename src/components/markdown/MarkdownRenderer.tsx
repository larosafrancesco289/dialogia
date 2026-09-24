import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { logger } from '@/lib/logger';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';
import { preprocessMarkdown } from '@/lib/markdown/preprocess';
import { CodeBlock } from '@/components/markdown/CodeBlock';
import {
  CodeFrame,
  detectLanguageFromPreChildren,
  extractCodeText,
} from '@/components/markdown/CodeFrame';
import { MermaidBlock } from '@/components/markdown/MermaidBlock';
import { useImageZoom } from '@/components/markdown/useImageZoom';

type RehypePlugins = NonNullable<React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']>;
type RehypePlugin = RehypePlugins[number];

// An unescaped `$` after preprocessMarkdown() ran is the only delimiter remark-math
// recognizes, so it is a sufficient signal that KaTeX is needed.
const MATH_DELIMITER_RE = /(?<!\\)\$/;

let katexPlugin: { plugin: RehypePlugin } | null = null;
let katexPluginPromise: Promise<{ plugin: RehypePlugin }> | null = null;

function loadKatexPlugin(): Promise<{ plugin: RehypePlugin }> {
  if (!katexPluginPromise) {
    katexPluginPromise = import('@/components/markdown/katex').then((mod) => {
      katexPlugin = { plugin: mod.rehypeKatex as RehypePlugin };
      return katexPlugin;
    });
  }
  return katexPluginPromise;
}

export function MarkdownRenderer({
  content,
  sources,
  streaming,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
  /** True while this block's content may still change on the next flush. */
  streaming?: boolean;
}) {
  const processedContent = useMemo(() => preprocessMarkdown(content, sources), [content, sources]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Every reply names its headings the same way, so each renderer prefixes
  // its ids: a link to a heading must reach the one in its own reply.
  const slugPrefix = `${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  // Prism highlighting is handled per-block to avoid React clobbering DOM

  // KaTeX (plus its stylesheet) is ~110 kB, so it loads only for content that
  // actually carries math delimiters. Until then math renders as raw source.
  const hasMath = useMemo(() => MATH_DELIMITER_RE.test(processedContent), [processedContent]);
  const [mathPlugin, setMathPlugin] = useState(katexPlugin);
  useEffect(() => {
    if (!hasMath || mathPlugin) return;
    let cancelled = false;
    loadKatexPlugin()
      .then((loaded) => {
        if (!cancelled) setMathPlugin(loaded);
      })
      .catch((error) => logger.error('Failed to load math renderer', error));
    return () => {
      cancelled = true;
    };
  }, [hasMath, mathPlugin]);

  const rehypePlugins = useMemo<RehypePlugins>(() => {
    const plugins: RehypePlugins = [];
    if (mathPlugin) plugins.push(mathPlugin.plugin);
    plugins.push(
      [rehypeSlug, { prefix: slugPrefix }],
      [rehypeAutolinkHeadings, { behavior: 'wrap', properties: { className: ['heading-anchor'] } }],
    );
    return plugins;
  }, [mathPlugin, slugPrefix]);

  useImageZoom(rootRef, processedContent, streaming);

  const components: Components = useMemo(
    () => ({
      // A wide table scrolls sideways in its own frame instead of squeezing
      // its columns until words break mid-letter.
      table: ({ node: _node, ...tableProps }) => (
        <div className="table-scroll">
          <table {...tableProps} />
        </div>
      ),
      pre: ({ children, node: _node, ...preProps }) => {
        // Detect Mermaid blocks and render as diagrams instead of <pre>
        const lang = detectLanguageFromPreChildren(children);
        if (lang === 'mermaid') {
          const code = extractCodeText(children);
          return <MermaidBlock code={code} streaming={streaming} />;
        }
        const code = extractCodeText(children);
        return (
          <CodeFrame {...preProps} language={lang} rawText={code}>
            <CodeBlock code={code} language={lang} streaming={streaming} />
          </CodeFrame>
        );
      },
      // react-markdown 9 passes no `inline` flag; a fenced block's <code> is
      // read and replaced by the <pre> override above.
      code: ({ className, children, node: _node, ...codeProps }) => (
        <code className={className || ''} {...codeProps}>
          {children}
        </code>
      ),
      // `node` is react-markdown's syntax tree; spread onto the DOM it
      // becomes node="[object Object]".
      a: ({ href, children, node: _node, ...props }) => {
        const isExternal = href && /^https?:\/\//.test(href);
        return (
          <a
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    [streaming],
  );

  return (
    <div ref={rootRef} className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
