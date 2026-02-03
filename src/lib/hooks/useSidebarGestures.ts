'use client';
// Hook: useSidebarGestures
// Responsibility: Encapsulate mobile sidebar open/close swipe gestures.

import { useEffect, useRef } from 'react';
import {
  SIDEBAR_EDGE_PX,
  SIDEBAR_GESTURE_REGION_PX,
  SIDEBAR_SWIPE_HYSTERESIS_PX,
  SIDEBAR_SWIPE_THRESHOLD_PX,
} from '@/lib/ui/layoutConstants';

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
    if (e.pointerType === 'mouse') return;
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
    const fromEdge = startX <= SIDEBAR_EDGE_PX;
    const collapsed = getCollapsed();
    const sidebarOpen = !collapsed;
    const inSidebarRegion = startX <= SIDEBAR_GESTURE_REGION_PX;
    active = (collapsed && fromEdge) || (sidebarOpen && inSidebarRegion);
  };
  const onMove = (e: PointerEvent) => {
    if (!active) return;
    const dx = e.clientX - startX;
    const adx = Math.abs(dx);
    const ady = Math.abs(e.clientY - startY);
    if (adx < SIDEBAR_SWIPE_HYSTERESIS_PX || adx < ady) return;
    const collapsed = getCollapsed();
    const sidebarOpen = !collapsed;
    if (collapsed && dx > SIDEBAR_SWIPE_THRESHOLD_PX) {
      setCollapsed(false);
      active = false;
    } else if (sidebarOpen && dx < -SIDEBAR_SWIPE_THRESHOLD_PX) {
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
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [isMobile, setCollapsed]);
}
