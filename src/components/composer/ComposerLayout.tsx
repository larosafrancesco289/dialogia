import { useEffect, useRef, type ReactNode, type DragEventHandler } from 'react';

export function ComposerLayout({
  children,
  variant,
  onDrop,
}: {
  children: ReactNode;
  variant: 'sticky' | 'hero';
  onDrop?: DragEventHandler<HTMLDivElement>;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // The composer floats over the end of the conversation; the list pads its
  // foot by this much so the last line can scroll clear of it. On a phone
  // the shell itself shrinks to the space above the keyboard, so the
  // composer never has to be re-pinned when the keyboard opens.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    if (variant === 'hero') {
      root.style.setProperty('--composer-height', '0px');
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const el = wrapperRef.current;
    if (!el) return;

    const applyHeight = () => {
      root.style.setProperty('--composer-height', `${Math.round(el.offsetHeight)}px`);
    };
    applyHeight();
    const ro = new ResizeObserver(applyHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty('--composer-height', '0px');
    };
  }, [variant]);

  return (
    <div
      ref={wrapperRef}
      className={variant === 'hero' ? 'composer-hero' : 'composer-chrome'}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {children}
    </div>
  );
}
