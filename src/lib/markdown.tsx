"use client";
import React, { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ content }: { content: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined") return;
      try {
        const PrismLib = (await import("prismjs")).default;
        // Some Prism language components depend on others. Load sequentially.
        (window as any).Prism = PrismLib;
        await import("prismjs/components/prism-markup");
        await import("prismjs/components/prism-javascript");
        await import("prismjs/components/prism-jsx");
        await import("prismjs/components/prism-typescript");
        await import("prismjs/components/prism-tsx");
        await import("prismjs/components/prism-json");
        await import("prismjs/components/prism-markdown");
        await import("prismjs/components/prism-bash");
        if (!cancelled) PrismLib.highlightAll();
      } catch (e) {
        // swallow highlighting errors so they don't crash the UI
        console.error("Prism init failed", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [content]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ node, inline, className, children, ...props }: any) {
          const match = /language-(\w+)/.exec(className || "");
          if (!inline && match) {
            return (
              <pre className="rounded-2xl bg-muted p-4 overflow-auto">
                <code className={`language-${match[1]}`}>{String(children).replace(/\n$/, "")}</code>
              </pre>
            );
          }
          return (
            <code className="bg-muted rounded px-1 py-0.5" {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}


