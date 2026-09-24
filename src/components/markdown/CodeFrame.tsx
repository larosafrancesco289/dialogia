import React, { Children, useEffect, useMemo, useRef, useState } from 'react';
import { CopyButton } from '@/components/markdown/CopyButton';

const WRAP_STORAGE_KEY = 'dialogia:code-wrap';
const WRAP_EVENT = 'dialogia:code-wrap-change';

function readWrapPreference(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(WRAP_STORAGE_KEY);
    if (stored === 'off') return false;
    if (stored === 'on') return true;
  } catch {
    // ignore storage access failures
  }
  return true;
}

function persistWrapPreference(next: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WRAP_STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // ignore storage access failures
  }
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<boolean>(WRAP_EVENT, { detail: next }));
  }, 0);
}

export function detectLanguageFromPreChildren(children: React.ReactNode): string | undefined {
  const first = Children.toArray(children)[0];
  if (!React.isValidElement(first)) return undefined;
  const className =
    typeof first.props?.className === 'string' ? (first.props.className as string) : undefined;
  if (!className) return undefined;
  const m = className.match(/language-([\w-]+)/);
  return m?.[1];
}

export function extractCodeText(children: React.ReactNode): string {
  const first = Children.toArray(children)[0];
  if (!React.isValidElement(first)) return '';
  const raw = first.props?.children ?? first.props?.value ?? first.props?.code ?? null;
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.join('');
  return typeof raw === 'string' ? raw : String(raw);
}

/**
 * A fenced code block's frame: the language, a wrap toggle shared by every
 * block (and every tab), collapse for long blocks, and copy.
 */
export function CodeFrame(
  props: React.HTMLAttributes<HTMLPreElement> & {
    children?: React.ReactNode;
    language?: string;
    rawText?: string;
  },
) {
  const preRef = useRef<HTMLPreElement>(null);
  // Expand by default; allow optional line wrapping toggle
  const [expanded, setExpanded] = useState(true);
  const [wrap, setWrap] = useState<boolean>(() => readWrapPreference());
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
    let ro: ResizeObserver | null = null;
    if (!expanded && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => compute());
      ro.observe(el);
    }
    const tid = setTimeout(compute, 0);
    return () => {
      ro?.disconnect();
      clearTimeout(tid);
    };
  }, [expanded, wrap, props.children]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPreferenceChange = (event: CustomEvent<boolean>) => {
      if (typeof event.detail !== 'boolean') return;
      setWrap(event.detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== WRAP_STORAGE_KEY) return;
      const next = event.newValue === null ? true : event.newValue !== 'off';
      setWrap(next);
    };
    window.addEventListener(WRAP_EVENT, onPreferenceChange as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(WRAP_EVENT, onPreferenceChange as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span className="code-block__lang">{language ?? 'text'}</span>
        <div className="code-block__actions">
          <button
            type="button"
            className="code-block__action"
            onClick={() => {
              setWrap((v) => {
                const next = !v;
                persistWrapPreference(next);
                return next;
              });
            }}
            title={wrap ? 'Disable wrap' : 'Enable wrap'}
          >
            {wrap ? 'Unwrap' : 'Wrap'}
          </button>
          {isOverflowing && (
            <button
              type="button"
              className="code-block__action"
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          )}
          <CopyButton text={codeText} />
        </div>
      </div>
      <pre
        ref={preRef}
        className={`overflow-auto relative ${props.className ?? ''}`}
        style={{ maxHeight: expanded ? 'none' : 480 }}
        data-expanded={expanded ? 'true' : 'false'}
        data-wrap={wrap ? 'true' : 'false'}
      >
        {props.children}
        {!expanded && isOverflowing && <div className="pre-fade" aria-hidden />}
      </pre>
    </div>
  );
}
