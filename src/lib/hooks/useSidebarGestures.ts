'use client';
// Hook: useSidebarGestures
// Responsibility: Encapsulate mobile sidebar open/close swipe gestures.

import { useEffect, useRef } from 'react';

const EDGE_PX = 24;
const SWIPE_THRESHOLD_PX = 56;
const HYSTERESIS_PX = 12;

type SidebarGestureController = {
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerEnd: () => void;
};

export function createSidebarGestureController(opts: {
  getCollapsed: () => boolean;
  setCollapsed: (value: boolean) => void;
}): SidebarGestureController {
  const { getCollapsed, setCollapsed } = opts;
    let startX = 0;
    let startY = 0;
    let active = false;

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
      const fromEdge = startX <= EDGE_PX;
      const collapsed = getCollapsed();
      const sidebarOpen = !collapsed;
      const inSidebarRegion = startX <= 360 + 40;
      active = (collapsed && fromEdge) || (sidebarOpen && inSidebarRegion);
    };
    const onMove = (e: PointerEvent) => {
      if (!active) return;
      const dx = e.clientX - startX;
      const adx = Math.abs(dx);
      const ady = Math.abs(e.clientY - startY);
      if (adx < HYSTERESIS_PX || adx < ady) return;
      const collapsed = getCollapsed();
      const sidebarOpen = !collapsed;
      if (collapsed && dx > SWIPE_THRESHOLD_PX) {
        setCollapsed(false);
        active = false;
      } else if (sidebarOpen && dx < -SWIPE_THRESHOLD_PX) {
        setCollapsed(true);
        active = false;
      }
    };
    const onEnd = () => {
      active = false;
    };
    return { onPointerDown: onDown, onPointerMove: onMove, onPointerEnd: onEnd };
}

export function useSidebarGestures(opts: {
  isMobile: boolean;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const { isMobile, collapsed, setCollapsed } = opts;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  useEffect(() => {
    if (!isMobile) return;
    const controller = createSidebarGestureController({
      getCollapsed: () => collapsedRef.current,
      setCollapsed,
    });
    const { onPointerDown, onPointerMove, onPointerEnd } = controller;
    window.addEventListener('pointerdown', onPointerDown, { passive: true } as any);
    window.addEventListener('pointermove', onPointerMove, { passive: true } as any);
    window.addEventListener('pointerup', onPointerEnd as any);
    window.addEventListener('pointercancel', onPointerEnd as any);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown as any);
      window.removeEventListener('pointermove', onPointerMove as any);
      window.removeEventListener('pointerup', onPointerEnd as any);
      window.removeEventListener('pointercancel', onPointerEnd as any);
    };
  }, [isMobile, setCollapsed]);
}
