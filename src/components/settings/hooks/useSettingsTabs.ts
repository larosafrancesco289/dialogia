import { useCallback, useRef, useState } from 'react';
import type { SectionId, TabId } from '@/components/settings/types';
import { initialSettingsTab, rememberSettingsTab } from '@/components/settings/sections/config';

export function useSettingsTabs() {
  const [activeTab, setActiveTabState] = useState<TabId>(initialSettingsTab);
  const setActiveTab = useCallback((tab: TabId) => {
    rememberSettingsTab(tab);
    setActiveTabState(tab);
  }, []);
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
