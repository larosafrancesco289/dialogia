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
  props: React.HTMLAttributes<HTMLPreElement> & {
    children?: React.ReactNode;
    language?: string;
    rawText?: string;
  },
) {
  const preRef = useRef<HTMLPreElement>(null);
  // Remove wrap control; default to expanded blocks
  const [expanded, setExpanded] = useState(true);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const language = useMemo(
    () => props.language ?? detectLanguageFromPreChildren(props.children),
    [props.language, props.children],
  );
  const codeText = useMemo(
    () => props.rawText ?? extractCodeText(props.children),
    [props.rawText, props.children],
  );

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
        // Use strict security level to reduce risk from untrusted diagram content
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
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

// Escapes raw text to safe HTML when highlighting is not yet ready
function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeLanguage(lang?: string): string | undefined {
  if (!lang) return undefined;
  const l = lang.toLowerCase();
  if (l === 'js') return 'javascript';
  if (l === 'ts') return 'typescript';
  if (l === 'sh' || l === 'shell') return 'bash';
  if (l === 'yml') return 'yaml';
  if (l === 'md') return 'markdown';
  if (l === 'html' || l === 'xml' || l === 'svg') return 'markup';
  return l;
}

async function ensurePrismLanguage(lang?: string) {
  const PrismLib = (await import('prismjs')).default;
  (window as any).Prism = PrismLib;
  const l = normalizeLanguage(lang);
  // Always have a baseline markup grammar for safety
  await import('prismjs/components/prism-markup');
  if (!l) return PrismLib;
  try {
    switch (l) {
      case 'javascript':
        await import('prismjs/components/prism-javascript');
        break;
      case 'jsx':
        await import('prismjs/components/prism-jsx');
        break;
      case 'typescript':
        await import('prismjs/components/prism-typescript');
        break;
      case 'tsx':
        await import('prismjs/components/prism-tsx');
        break;
      case 'json':
        await import('prismjs/components/prism-json');
        break;
      case 'markdown':
        await import('prismjs/components/prism-markdown');
        break;
      case 'bash':
        await import('prismjs/components/prism-bash');
        break;
      case 'python':
        await import('prismjs/components/prism-python');
        break;
      case 'go':
        await import('prismjs/components/prism-go');
        break;
      case 'rust':
        await import('prismjs/components/prism-rust');
        break;
      case 'java':
        await import('prismjs/components/prism-java');
        break;
      case 'sql':
        await import('prismjs/components/prism-sql');
        break;
      case 'yaml':
        await import('prismjs/components/prism-yaml');
        break;
      case 'toml':
        await import('prismjs/components/prism-toml');
        break;
      case 'diff':
        await import('prismjs/components/prism-diff');
        break;
      default:
        // Best-effort: no extra import
        break;
    }
  } catch {
    // ignore missing language modules
  }
  return PrismLib;
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const lang = normalizeLanguage(language);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Prism = await ensurePrismLanguage(lang);
        const grammar = (lang && Prism.languages[lang]) || Prism.languages.markup;
        const h = Prism.highlight(code, grammar, (lang as string) || 'markup');
        if (!cancelled) setHtml(h);
      } catch {
        if (!cancelled) setHtml(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, lang]);
  const cls = `language-${lang ?? 'markup'}`;
  return <code className={cls} dangerouslySetInnerHTML={{ __html: html ?? escapeHtml(code) }} />;
}

export function Markdown({ content }: { content: string }) {
  // Prism highlighting is handled per-block to avoid React clobbering DOM

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
            const code = extractCodeText(children);
            return (
              <PreWithTools {...preProps} language={lang} rawText={code}>
                <CodeBlock code={code} language={lang} />
              </PreWithTools>
            );
          },
          code({ inline, className, children, ...props }: any) {
            // Only style inline code; block code is handled by the <pre> wrapper above
            if (!inline) {
              const lang = (className || '').replace(/(^|.*language-)([\w-]+).*/, '$2');
              const text = Array.isArray(children) ? children.join('') : String(children || '');
              return <CodeBlock code={text} language={lang} />;
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
