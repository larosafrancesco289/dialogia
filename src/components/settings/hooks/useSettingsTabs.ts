'use client';

import { useCallback, useRef, useState } from 'react';
import type { TabId } from '@/components/settings/types';

export function useSettingsTabs(defaultTab: TabId = 'models') {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const registerSection = useCallback((id: string) => {
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
