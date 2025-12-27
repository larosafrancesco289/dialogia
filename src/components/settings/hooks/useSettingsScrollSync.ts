'use client';

import { useCallback, useEffect, useRef } from 'react';

type ScrollSyncArgs = {
  activeSection: string | null;
  setActiveSection: (sectionId: string | null) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  tabBarRef: React.RefObject<HTMLDivElement | null>;
  activeSections: string[];
};

export function useSettingsScrollSync({
  activeSection,
  setActiveSection,
  sectionRefs,
  tabBarRef,
  activeSections,
}: ScrollSyncArgs) {
  const drawerRef = useRef<HTMLDivElement | null>(null);

  const scrollToSection = useCallback(
    (sectionId: string) => {
      const container = drawerRef.current;
      const target = sectionRefs.current[sectionId];
      if (!container || !target) return;

      const header = container.querySelector('[data-settings-header]') as HTMLElement | null;
      const headerHeight = header?.offsetHeight ?? 0;
      const tabBarHeight = tabBarRef.current?.offsetHeight ?? 0;
      const offset = headerHeight + tabBarHeight + 16;

      const prefersReducedMotion =
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
          : false;

      container.scrollTo({
        top: Math.max(0, target.offsetTop - offset),
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
      setActiveSection(sectionId);
    },
    [sectionRefs, tabBarRef, setActiveSection],
  );

  useEffect(() => {
    const firstSection = activeSections[0] ?? null;
    setActiveSection(firstSection);
    if (drawerRef.current) {
      drawerRef.current.scrollTo({ top: 0 });
    }
  }, [activeSections, setActiveSection]);

  useEffect(() => {
    const container = drawerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const id = visible[0].target.getAttribute('data-settings-section');
        if (id && id !== activeSection) {
          setActiveSection(id);
        }
      },
      {
        root: container,
        threshold: 0.3,
        rootMargin: '-80px 0px -55% 0px',
      },
    );

    activeSections.forEach((id) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeSections, activeSection, setActiveSection, sectionRefs]);

  return { drawerRef, scrollToSection };
}
