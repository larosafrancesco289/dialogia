'use client';
// Hook: useSidebarGestures
// Responsibility: Encapsulate mobile sidebar open/close swipe gestures.

import { useEffect } from 'react';

export function useSidebarGestures(opts: {
  isMobile: boolean;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const { isMobile, collapsed, setCollapsed } = opts;
  useEffect(() => {
    if (!isMobile) return;
    let startX = 0;
    let startY = 0;
    let active = false;
    const EDGE = 24;
    const THRESH = 56;
    const HYST = 12;

    const onDown = (e: PointerEvent) => {
      if ((e.pointerType as any) === 'mouse') return;
      const t = e.target as Element | null;
      if (
        t &&
        (t.closest('[data-row-press]') ||
          t.closest('[data-chat-swipe]') ||
          t.closest('[data-folder-swipe]'))
      ) {
        active = false;
        return;
      }
      startX = e.clientX;
      startY = e.clientY;
      const fromEdge = startX <= EDGE;
      const sidebarOpen = !collapsed;
      const inSidebarRegion = startX <= 360 + 40;
      active = (collapsed && fromEdge) || (sidebarOpen && inSidebarRegion);
    };
    const onMove = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      const adx = Math.abs(dx);
      const ady = Math.abs(e.clientY - startY);
      if (adx < HYST || adx < ady) return;
      const sidebarOpen = !collapsed;
      if (collapsed && dx > THRESH) {
        setCollapsed(false);
        active = false;
      } else if (sidebarOpen && dx < -THRESH) {
        setCollapsed(true);
        active = false;
      }
    };
    const onEnd = () => {
      active = false;
    };
    window.addEventListener('pointerdown', onDown, { passive: true } as any);
    window.addEventListener('pointermove', onMove, { passive: true } as any);
    window.addEventListener('pointerup', onEnd as any);
    window.addEventListener('pointercancel', onEnd as any);
    return () => {
      window.removeEventListener('pointerdown', onDown as any);
      window.removeEventListener('pointermove', onMove as any);
      window.removeEventListener('pointerup', onEnd as any);
      window.removeEventListener('pointercancel', onEnd as any);
    };
  }, [isMobile, collapsed, setCollapsed]);
}
