'use client';
import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { RenderSection, SectionId, TabId } from '@/components/settings/types';
import { useSettingsTabs } from '@/components/settings/hooks/useSettingsTabs';
import { useSettingsScrollSync } from '@/components/settings/hooks/useSettingsScrollSync';
import { TAB_LIST, TAB_SECTIONS, SECTION_TITLES } from '@/components/settings/sections/config';
import { springs } from '@/lib/mobile/springConfig';

const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: springs.gentle,
  },
};

export type SettingsNavigationState = {
  drawerRef: React.RefObject<HTMLDivElement>;
  tabBarRef: React.RefObject<HTMLDivElement>;
  sidebarRef: React.RefObject<HTMLElement>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  activeSection: SectionId | null;
  navSections: SectionId[];
  scrollToSection: (sectionId: SectionId) => void;
  handleSidebarKeyNav: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  renderSection: RenderSection;
};

export function useSettingsNavigation(): SettingsNavigationState {
  const [searchQuery, setSearchQuery] = useState('');
  const {
    activeTab,
    setActiveTab,
    activeSection,
    setActiveSection,
    tabBarRef,
    sectionRefs,
    registerSection,
  } = useSettingsTabs();

  const { drawerRef, scrollToSection } = useSettingsScrollSync({
    activeSection,
    setActiveSection,
    sectionRefs,
    tabBarRef,
    activeSections: TAB_SECTIONS[activeTab] ?? [],
  });

  const sidebarRef = useRef<HTMLElement>(null);

  const renderSection: RenderSection = useCallback(
    (tabId: TabId, sectionId: SectionId, content: ReactNode) => {
      if (activeTab !== tabId) return null;

      // Filter by search query
      if (searchQuery) {
        const title = SECTION_TITLES[sectionId] ?? sectionId;
        if (!title.toLowerCase().includes(searchQuery.toLowerCase())) {
          return null;
        }
      }

      return (
        <motion.div
          key={sectionId}
          id={`settings-${sectionId}`}
          data-settings-section={sectionId}
          ref={registerSection(sectionId)}
          variants={staggerItem}
        >
          {content}
        </motion.div>
      );
    },
    [activeTab, registerSection, searchQuery],
  );

  const handleSidebarKeyNav = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const buttons = sidebarRef.current?.querySelectorAll('button');
      if (!buttons) return;

      let nextIndex = index;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault();
          nextIndex = (index + 1) % TAB_LIST.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault();
          nextIndex = (index - 1 + TAB_LIST.length) % TAB_LIST.length;
          break;
        case 'Home':
          event.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          event.preventDefault();
          nextIndex = TAB_LIST.length - 1;
          break;
        default:
          return;
      }

      setActiveTab(TAB_LIST[nextIndex].id);
      (buttons[nextIndex] as HTMLButtonElement)?.focus();
    },
    [setActiveTab],
  );

  const navSections = TAB_SECTIONS[activeTab] ?? [];

  return {
    drawerRef,
    tabBarRef,
    sidebarRef,
    searchQuery,
    setSearchQuery,
    activeTab,
    setActiveTab,
    activeSection,
    navSections,
    scrollToSection,
    handleSidebarKeyNav,
    renderSection,
  };
}
