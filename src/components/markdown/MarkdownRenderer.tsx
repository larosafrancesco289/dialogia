import React, {
  createContext,
  createElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { logger } from '@/lib/logger';
import type { MarkdownCitationSource } from '@/lib/markdown/citations';
import { hasMathDelimiter, preprocessMarkdown } from '@/lib/markdown/preprocess';
import { loadKatexPlugin, loadedKatexPlugin } from '@/components/markdown/loadKatex';
import { CodeBlock } from '@/components/markdown/CodeBlock';
import {
  CodeFrame,
  detectLanguageFromPreChildren,
  extractCodeText,
} from '@/components/markdown/CodeFrame';
import { MermaidBlock } from '@/components/markdown/MermaidBlock';
import { useImageZoom } from '@/components/markdown/useImageZoom';

type RehypePlugins = NonNullable<React.ComponentProps<typeof ReactMarkdown>['rehypePlugins']>;

export function MarkdownRenderer({
  content,
  sources,
  streaming,
  inline,
}: {
  content: string;
  sources?: MarkdownCitationSource[];
  /** True while this block's content may still change on the next flush. */
  streaming?: boolean;
  /** A single line set inside other text (a quiz option, a topic name). */
  inline?: boolean;
}) {
  const processedContent = useMemo(() => preprocessMarkdown(content, sources), [content, sources]);
  const rootRef = useRef<HTMLElement>(null);
  // Every reply names its headings the same way, so each renderer prefixes
  // its ids: a link to a heading must reach the one in its own reply.
  const slugPrefix = `${useId().replace(/[^a-zA-Z0-9]/g, '')}-`;
  // Prism highlighting is handled per-block to avoid React clobbering DOM

  // KaTeX (plus its stylesheet) is ~110 kB, so it loads only for content that
  // actually carries math delimiters. Until then maths is set as quiet plain
  // text (`MathPending`).
  const hasMath = useMemo(() => hasMathDelimiter(processedContent), [processedContent]);
  const [mathPlugin, setMathPlugin] = useState(loadedKatexPlugin);
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

  if (inline) {
    return (
      <span ref={rootRef} className="markdown markdown--inline">
        <ReactMarkdown
          remarkPlugins={INLINE_REMARK_PLUGINS}
          rehypePlugins={rehypePlugins}
          components={INLINE_COMPONENTS}
          disallowedElements={INLINE_UNWRAPPED}
          unwrapDisallowed
        >
          {processedContent}
        </ReactMarkdown>
      </span>
    );
  }

  return (
    <StreamingContext.Provider value={!!streaming}>
      <div ref={rootRef as React.RefObject<HTMLDivElement>} className="markdown">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={rehypePlugins}
          components={COMPONENTS}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </StreamingContext.Provider>
  );
}

// Whether the block is still arriving, read by the overrides below through
// context: were it a dependency of the components map, the map would change
// identity when the stream ends, and React would remount every table and code
// block in the reply because their element types changed.
const StreamingContext = createContext(false);

type MdastNode = { type: string; value?: string; children?: MdastNode[] };

// A line break in prose stays a line break, as in every chat app: markdown
// alone would join "Po\nTiber\nArno" into one line. Code and maths are not
// text nodes, so they keep their own lines anyway.
function keepLineBreaks(node: MdastNode) {
  if (!node.children) return;
  node.children = node.children.flatMap((child) => {
    if (child.type !== 'text' || !child.value?.includes('\n')) {
      keepLineBreaks(child);
      return [child];
    }
    return child.value
      .split(/\r?\n/)
      .flatMap((line, i) => [
        ...(i ? [{ type: 'break' }] : []),
        ...(line ? [{ type: 'text', value: line }] : []),
      ]);
  });
}

const remarkLineBreaks = () => keepLineBreaks;

// Inline text is one line set inside other text, so it keeps markdown's joining.
const INLINE_REMARK_PLUGINS = [remarkGfm, remarkMath];
const REMARK_PLUGINS = [...INLINE_REMARK_PLUGINS, remarkLineBreaks];

// Maths reaches these overrides only while KaTeX is still on its way (once
// it is here, rehype-katex has replaced it): set it as quiet plain text, its
// dollars already gone, at the size of the words around it, so the source
// never flashes and the typeset formula lands about where the text stood.
function Code({
  className,
  children,
  node: _node,
  ...codeProps
}: ComponentProps<'code'> & ExtraProps) {
  if (className?.includes('language-math')) return <span className="math-pending">{children}</span>;
  return (
    <code className={className} {...codeProps}>
      {children}
    </code>
  );
}

function Pre({ children, node: _node, ...preProps }: ComponentProps<'pre'> & ExtraProps) {
  const streaming = useContext(StreamingContext);
  // Detect Mermaid blocks and render as diagrams instead of <pre>
  const lang = detectLanguageFromPreChildren(children);
  const code = extractCodeText(children);
  if (lang === 'mermaid') return <MermaidBlock code={code} streaming={streaming} />;
  if (lang === 'math')
    return <div className="math-pending math-pending--display">{code.trim()}</div>;
  return (
    <CodeFrame {...preProps} language={lang} rawText={code}>
      <CodeBlock code={code} language={lang} streaming={streaming} />
    </CodeFrame>
  );
}

// Arabic or Hebrew reads right to left: each block takes its direction from
// its own first letter, so a reply that mixes scripts sets each part right.
const AUTO_DIR_TAGS = [
  'p',
  'li',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'th',
  'td',
] as const;

const AUTO_DIR_COMPONENTS: Components = Object.fromEntries(
  AUTO_DIR_TAGS.map((tag) => [
    tag,
    ({ node: _node, ...props }: ComponentProps<typeof tag> & ExtraProps) =>
      createElement(tag, { dir: 'auto', ...props }),
  ]),
);

const COMPONENTS: Components = {
  ...AUTO_DIR_COMPONENTS,
  // A wide table scrolls sideways in its own frame instead of squeezing
  // its columns until words break mid-letter.
  table: ({ node: _node, ...tableProps }) => (
    <div className="table-scroll">
      <table {...tableProps} />
    </div>
  ),
  pre: Pre,
  // react-markdown 9 passes no `inline` flag; a fenced block's <code> is
  // read and replaced by the <pre> override above.
  code: Code,
  // `node` is react-markdown's syntax tree; spread onto the DOM it
  // becomes node="[object Object]".
  a: ({ href, children, node: _node, ...props }) => {
    const isExternal = href && /^https?:\/\//.test(href);
    // A citation shows only its number; its title says which source it is.
    const isCitation = typeof children === 'string' && /^\d+$/.test(children);
    return (
      <a
        href={href}
        target={isExternal ? '_blank' : undefined}
        rel={isExternal ? 'noopener noreferrer' : undefined}
        aria-label={isCitation ? props.title : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
};

// Inline text keeps its words, emphasis, code and maths, but no blocks: it
// sits in a sentence or inside a button, where a paragraph, a list or a link
// (a control inside a control) would break the line it belongs to.
const INLINE_UNWRAPPED = [
  'a',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'pre',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

const INLINE_COMPONENTS: Components = {
  p: ({ children }) => <>{children}</>,
  code: Code,
};
