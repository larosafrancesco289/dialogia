import { useEffect, useId, useRef, useState } from 'react';

export function MermaidBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const id = useId().replace(/[:]/g, '_');
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // While streaming, the diagram source is still growing; rendering partial
    // definitions just produces parse errors, so wait for the final pass.
    if (!isVisible || streaming) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        // Use strict security level to reduce risk from untrusted diagram content
        mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        const { svg } = await mermaid.render(`m_${id}`, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        // ignore
        if (!cancelled && ref.current) {
          ref.current.innerText = 'Mermaid diagram failed to render.';
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [code, id, isVisible, streaming]);
  if (streaming) {
    return (
      <pre className="mermaid-diagram">
        <code>{code}</code>
      </pre>
    );
  }
  return <div className="mermaid-diagram" ref={ref} />;
}
