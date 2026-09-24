import { useEffect, type RefObject } from 'react';
import { logger } from '@/lib/logger';

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

type MediumZoomFactory = typeof import('medium-zoom').default;
type MediumZoomInstance = ReturnType<MediumZoomFactory>;

/**
 * Attaches medium-zoom to the images under `rootRef` once `content` has
 * rendered, off the critical path. Skipped while streaming.
 */
export function useImageZoom(
  rootRef: RefObject<HTMLElement | null>,
  content: string,
  streaming?: boolean,
) {
  useEffect(() => {
    if (streaming) return;
    let zoom: MediumZoomInstance | undefined;
    let cancelled = false;
    const run = async () => {
      if (typeof window === 'undefined' || cancelled) return;
      try {
        const root = rootRef.current;
        if (!root) return;
        const images = root.querySelectorAll('img');
        if (images.length === 0) return;
        const mediumZoom = (await import('medium-zoom')).default as MediumZoomFactory;
        if (!cancelled) {
          // The same darkroom as the attachment lightbox.
          zoom = mediumZoom(images, { background: 'rgb(0 0 0 / 0.86)', margin: 24 });
        }
      } catch (error) {
        logger.error('Failed to initialize image zoom', error);
      }
    };
    const idle = (window as WindowWithIdleCallback).requestIdleCallback;
    if (typeof idle === 'function') {
      idle(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
    return () => {
      cancelled = true;
      try {
        zoom?.detach?.();
      } catch (error) {
        logger.error('Failed to detach zoom', error);
      }
    };
  }, [rootRef, content, streaming]);
}
