'use client';

import { useCallback, useRef, useState } from 'react';
import type { SectionId, TabId } from '@/components/settings/types';

export function useSettingsTabs(defaultTab: TabId = 'models-routing') {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>(
    {} as Record<SectionId, HTMLDivElement | null>,
  );

  const registerSection = useCallback((id: SectionId) => {
    return (node: HTMLDivElement | null) => {
      if (node) {
        sectionRefs.current[id] = node;
      } else {
        delete sectionRefs.current[id];
      }
    };
  }, []);

  return {
    activeTab,
    setActiveTab,
    activeSection,
    setActiveSection,
    tabBarRef,
    sectionRefs,
    registerSection,
  };
}
