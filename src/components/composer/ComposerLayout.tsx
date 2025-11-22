import { useEffect, useRef, useState, type ReactNode, type DragEventHandler } from 'react';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import type { KeyboardMetrics } from '@/lib/hooks/useKeyboardInsets';

export function ComposerLayout({
  children,
  variant,
  keyboardMetrics,
  focused,
  onDrop,
}: {
  children: ReactNode;
  variant: 'sticky' | 'hero';
  keyboardMetrics: KeyboardMetrics;
  focused: boolean;
  onDrop?: DragEventHandler<HTMLDivElement>;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const isCompact = useIsMobile();

  const shouldPinToViewport =
    isCompact && variant !== 'hero' && (focused || keyboardMetrics.offset > 0);

  const wrapperClass =
    variant === 'hero'
      ? 'composer-hero'
      : `composer-chrome${shouldPinToViewport ? ' is-mobile-pinned' : ''}`;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!isCompact) {
      root.classList.remove('keyboard-active');
      return () => {
        root.classList.remove('keyboard-active');
      };
    }
    if (shouldPinToViewport) root.classList.add('keyboard-active');
    else root.classList.remove('keyboard-active');
    return () => {
      root.classList.remove('keyboard-active');
    };
  }, [isCompact, shouldPinToViewport]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (variant === 'hero') {
      document.documentElement.style.setProperty('--composer-height', '0px');
      setComposerHeight(0);
      return;
    }
    if (typeof ResizeObserver === 'undefined') return;
    const el = wrapperRef.current;
    if (!el) return;

    const applyHeight = () => {
      const h = Math.round(el.offsetHeight);
      document.documentElement.style.setProperty('--composer-height', `${h}px`);
      setComposerHeight(h);
    };
    applyHeight();
    const ro = new ResizeObserver(applyHeight);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--composer-height', '0px');
      setComposerHeight(0);
    };
  }, [variant]);

  const isHeroVariant = variant === 'hero';

  return (
    <>
      {shouldPinToViewport && composerHeight > 0 && !isHeroVariant && (
        <div
          className="composer-placeholder"
          aria-hidden="true"
          style={{ height: `${composerHeight}px` }}
        />
      )}
      <div
        ref={wrapperRef}
        className={wrapperClass}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {children}
      </div>
    </>
  );
}
