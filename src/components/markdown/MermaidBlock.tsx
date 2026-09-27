import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';

// Wide diagrams shrink to fit only this far; below it they keep their size
// and scroll sideways, so a phone does not get 4px labels.
const MIN_SCALE = 0.6;

let renderSeq = 0;

// The `dark` class on <html> is the resolved theme (Auto follows the system
// through it), so diagrams watch the class rather than the stored mode.
function subscribeToDarkClass(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
const isDarkNow = () => document.documentElement.classList.contains('dark');
const isDarkOnServer = () => false;

type MermaidTheme = {
  theme: 'base' | 'dark' | 'neutral';
  themeVariables?: Record<string, string | boolean>;
};

// Mermaid's theming only understands hex colours, so the tokens are passed
// through when they are hex and the stock themes stand in otherwise.
function themeFromTokens(dark: boolean): MermaidTheme {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  const colors = {
    canvas: token('--color-canvas'),
    surface: token('--color-surface'),
    muted: token('--color-muted'),
    fg: token('--color-fg'),
    fgMuted: token('--color-fg-muted'),
  };
  const allHex = Object.values(colors).every((value) => /^#[0-9a-f]{3,8}$/i.test(value));
  if (!allHex) return { theme: dark ? 'dark' : 'neutral' };
  return {
    theme: 'base',
    themeVariables: {
      darkMode: dark,
      background: colors.canvas,
      primaryColor: colors.muted,
      primaryTextColor: colors.fg,
      primaryBorderColor: colors.fgMuted,
      secondaryColor: colors.surface,
      tertiaryColor: colors.canvas,
      lineColor: colors.fgMuted,
      textColor: colors.fg,
    },
  };
}

export function MermaidBlock({ code, streaming }: { code: string; streaming?: boolean }) {
  const id = useId().replace(/[:]/g, '_');
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const dark = useSyncExternalStore(subscribeToDarkClass, isDarkNow, isDarkOnServer);

  // While streaming there is only the <pre>, so the observer attaches once
  // the diagram's own element mounts.
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
  }, [streaming]);

  useEffect(() => {
    // While streaming, the diagram source is still growing; rendering partial
    // definitions just produces parse errors, so wait for the final pass.
    if (!isVisible || streaming) return;
    let cancelled = false;
    const tid = setTimeout(async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        // Use strict security level to reduce risk from untrusted diagram content
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          ...themeFromTokens(dark),
        });
        // Each pass gets a fresh id: mermaid removes any element that already
        // holds the id, which would be the diagram currently on screen.
        const { svg } = await mermaid.render(`m_${id}_${++renderSeq}`, code);
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        const svgEl = ref.current.querySelector('svg');
        const naturalWidth = svgEl?.viewBox.baseVal?.width ?? 0;
        if (svgEl && naturalWidth > 0) {
          svgEl.style.minWidth = `${Math.round(naturalWidth * MIN_SCALE)}px`;
        }
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
  }, [code, id, isVisible, streaming, dark]);
  if (streaming) {
    return (
      <pre className="mermaid-diagram">
        <code>{code}</code>
      </pre>
    );
  }
  return <div className="mermaid-diagram" ref={ref} />;
}
