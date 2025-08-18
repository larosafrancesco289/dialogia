'use client';
import React, { Children, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // ignore
    }
  };
  return (
    <button
      type="button"
      className="icon-button opacity-70 hover:opacity-100"
      aria-label="Copy to clipboard"
      title={copied ? 'Copied' : 'Copy'}
      onClick={onCopy}
    >
      {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
    </button>
  );
}

function detectLanguageFromPreChildren(children: React.ReactNode): string | undefined {
  const first = Children.toArray(children)[0] as any;
  const className: string | undefined = first?.props?.className;
  if (!className) return undefined;
  const m = className.match(/language-([\w-]+)/);
  return m?.[1];
}

function extractCodeText(children: React.ReactNode): string {
  const first = Children.toArray(children)[0] as any;
  const raw = first?.props?.children;
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.join('');
  return String(raw);
}

function PreWithTools(
  props: React.HTMLAttributes<HTMLPreElement> & { children?: React.ReactNode },
) {
  const preRef = useRef<HTMLPreElement>(null);
  // Remove wrap control; default to expanded blocks
  const [expanded, setExpanded] = useState(true);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const language = useMemo(() => detectLanguageFromPreChildren(props.children), [props.children]);
  const codeText = useMemo(() => extractCodeText(props.children), [props.children]);

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const compute = () => {
      const over = el.scrollHeight > el.clientHeight + 1; // tolerate sub-pixel
      setIsOverflowing(over);
    };
    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    const tid = setTimeout(compute, 0);
    return () => {
      ro.disconnect();
      clearTimeout(tid);
    };
  }, [expanded, props.children]);

  return (
    <pre
      ref={preRef}
      className={`rounded-2xl bg-muted p-4 pt-12 overflow-auto relative ${props.className ?? ''}`}
      style={{ maxHeight: expanded ? 'none' : 480 }}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <div className="pre-toolbar absolute left-3 top-2 right-3 flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          {isOverflowing && (
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <CopyButton text={codeText} />
          {language && <span className="badge text-xs">{language}</span>}
        </div>
      </div>
      {props.children}
      {!expanded && isOverflowing && <div className="pre-fade" aria-hidden />}
    </pre>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const id = useId().replace(/[:]/g, '_');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
        const { svg } = await mermaid.render(`m_${id}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        // ignore
        if (ref.current) {
          ref.current.innerText = 'Mermaid diagram failed to render.';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id]);
  return <div className="mermaid-diagram" ref={ref} />;
}

export function Markdown({ content }: { content: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === 'undefined') return;
      try {
        const PrismLib = (await import('prismjs')).default;
        // Some Prism language components depend on others. Load sequentially.
        (window as any).Prism = PrismLib;
        await import('prismjs/components/prism-markup');
        await import('prismjs/components/prism-javascript');
        await import('prismjs/components/prism-jsx');
        await import('prismjs/components/prism-typescript');
        await import('prismjs/components/prism-tsx');
        await import('prismjs/components/prism-json');
        await import('prismjs/components/prism-markdown');
        await import('prismjs/components/prism-bash');
        await import('prismjs/components/prism-python');
        await import('prismjs/components/prism-go');
        await import('prismjs/components/prism-rust');
        await import('prismjs/components/prism-java');
        await import('prismjs/components/prism-sql');
        await import('prismjs/components/prism-yaml');
        await import('prismjs/components/prism-toml');
        await import('prismjs/components/prism-diff');
        if (!cancelled) PrismLib.highlightAll();
      } catch (e) {
        // swallow highlighting errors so they don't crash the UI
        console.error('Prism init failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  // Attach medium-zoom to images inside markdown for a better reading experience
  useEffect(() => {
    let zoom: any;
    (async () => {
      if (typeof window === 'undefined') return;
      try {
        const mediumZoom = (await import('medium-zoom')).default as any;
        zoom = mediumZoom('.markdown img', { background: 'rgba(0,0,0,0.7)', margin: 24 });
      } catch {}
    })();
    return () => {
      try {
        zoom?.detach?.();
      } catch {}
    };
  }, [content]);

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeKatex,
          rehypeSlug,
          [
            rehypeAutolinkHeadings as any,
            { behavior: 'wrap', properties: { className: 'heading-anchor' } },
          ],
        ]}
        components={{
          pre: ({ children, ...preProps }: any) => {
            // Detect Mermaid blocks and render as diagrams instead of <pre>
            const lang = detectLanguageFromPreChildren(children);
            if (lang === 'mermaid') {
              const code = extractCodeText(children);
              return <MermaidBlock code={code} />;
            }
            return <PreWithTools {...preProps}>{children}</PreWithTools>;
          },
          code({ inline, className, children, ...props }: any) {
            // Only style inline code; block code is handled by the <pre> wrapper above
            if (!inline) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={`bg-muted rounded px-1 py-0.5 ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          a({ href, children, ...props }: any) {
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
