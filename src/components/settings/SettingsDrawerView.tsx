import { motionTransition } from '@/lib/ui/motion';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  TAB_LIST,
  TAB_SECTIONS,
  SECTION_TITLES,
  sectionMatches,
} from '@/components/settings/sections/config';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
import { SettingsSearch } from '@/components/settings/SettingsSearch';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { MEDIA_QUERIES } from '@/lib/ui/breakpoints';
import type { TabId } from '@/components/settings/types';
import { AutoSaveToast } from '@/components/settings/AutoSaveToast';
import type { SettingsDrawerState } from '@/components/settings/hooks/useSettingsDrawerState';

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

// A page with one section named like the page says what it holds instead.
const TAB_SUMMARY_FALLBACK: Partial<Record<TabId, string>> = {
  tutor: 'Tutor mode and its model',
};

/** "Providers · Your servers · Web search": what a Settings page holds. */
function tabSummary(tabId: TabId, label: string): string | null {
  const titles = TAB_SECTIONS[tabId].map((id) => SECTION_TITLES[id]);
  if (titles.length === 1 && titles[0] === label) return TAB_SUMMARY_FALLBACK[tabId] ?? null;
  return titles.join(' · ');
}

export function SettingsDrawerView(props: SettingsDrawerState) {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  return isMobile ? <SettingsPhoneView {...props} /> : <SettingsWideView {...props} />;
}

/**
 * Settings on a phone: a list of pages, each opening on its own like the
 * Settings app, with search at the top of the list. The two rows of tabs
 * the wide layout needs don't fit a phone's width.
 */
function SettingsPhoneView({
  closing,
  drawerRef,
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  tabContent,
  closeWithAnim,
  saveStatus,
}: SettingsDrawerState) {
  const [page, setPage] = useState<'list' | 'tab'>('list');
  const reducedMotion = useReducedMotion();
  const searching = searchQuery.trim().length > 0;
  const hasResults =
    !searching ||
    Object.values(TAB_SECTIONS).some((sections) =>
      sections.some((sectionId) => sectionMatches(sectionId, searchQuery)),
    );
  const onPage = page === 'tab' && !searching;
  // Back leaves a page for the list, and the list for the chat.
  useBackToClose(!closing, closeWithAnim);
  useBackToClose(onPage, () => setPage('list'));
  useBackToClose(searching, () => setSearchQuery(''));
  const tabLabel = TAB_LIST.find((tab) => tab.id === activeTab)?.label ?? 'Settings';

  // Each page opens at its top, holding focus: the row or Back that opened it
  // is gone, and focus dropped on the page would leave Escape nowhere to go.
  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    drawer.scrollTo({ top: 0 });
    if (!drawer.contains(document.activeElement)) drawer.focus({ preventScroll: true });
  }, [page, activeTab, drawerRef]);

  const pageMotion = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, x: onPage ? 24 : -24 },
        animate: { opacity: 1, x: 0 },
        transition: motionTransition.quick,
      };

  return (
    <>
      <SettingsDrawerShell
        closing={closing}
        onClose={closeWithAnim}
        drawerRef={drawerRef}
        title={onPage ? tabLabel : 'Settings'}
        onBack={onPage ? () => setPage('list') : undefined}
      >
        {onPage ? (
          <motion.div key={`tab-${activeTab}`} className="settings-phone-page" {...pageMotion}>
            <motion.div variants={staggerContainer} initial="hidden" animate="show">
              {tabContent}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="list" className="settings-phone-page" {...pageMotion}>
            <div className="settings-phone-search">
              <SettingsSearch
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search settings"
              />
            </div>
            {searching ? (
              <motion.div variants={staggerContainer} initial="hidden" animate="show">
                {tabContent}
                {!hasResults && (
                  <p className="settings-empty py-6">
                    Nothing in settings matches “{searchQuery}”.
                  </p>
                )}
              </motion.div>
            ) : (
              <nav className="settings-phone-list" aria-label="Settings pages">
                {TAB_LIST.map((tab) => {
                  const summary = tabSummary(tab.id, tab.label);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className="settings-phone-row"
                      onClick={() => {
                        setActiveTab(tab.id);
                        setPage('tab');
                      }}
                    >
                      <span className="settings-phone-row__text">
                        <span className="settings-phone-row__label">{tab.label}</span>
                        {summary && <span className="settings-phone-row__summary">{summary}</span>}
                      </span>
                      <ChevronRightIcon className="settings-phone-row__chevron" aria-hidden />
                    </button>
                  );
                })}
              </nav>
            )}
          </motion.div>
        )}
      </SettingsDrawerShell>

      <AutoSaveToast status={saveStatus} />
    </>
  );
}

function SettingsWideView({
  closing,
  drawerRef,
  tabBarRef,
  sidebarRef,
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  handleSidebarKeyNav,
  tabContent,
  closeWithAnim,
  saveStatus,
}: SettingsDrawerState) {
  const searching = searchQuery.trim().length > 0;
  const hasResults =
    !searching ||
    Object.values(TAB_SECTIONS).some((sections) =>
      sections.some((sectionId) => sectionMatches(sectionId, searchQuery)),
    );

  return (
    <>
      <SettingsDrawerShell
        closing={closing}
        onClose={closeWithAnim}
        drawerRef={drawerRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      >
        <div className="flex h-[calc(100%-var(--chrome-height))]">
          {/* Persistent Sidebar Navigation (Desktop) */}
          <nav
            ref={sidebarRef}
            className="settings-nav hidden md:flex flex-col w-48 shrink-0 p-3 sticky top-[var(--chrome-height)] h-[calc(100dvh-var(--chrome-height))] overflow-y-auto"
            aria-label="Settings navigation"
            role="tablist"
            aria-orientation="vertical"
          >
            <div className="settings-sidebar">
              {TAB_LIST.map((tab, index) => (
                <button
                  key={tab.id}
                  id={`settings-tab-${tab.id}`}
                  role="tab"
                  aria-selected={!searching && activeTab === tab.id}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  className={`settings-sidebar-item ${!searching && activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => {
                    setSearchQuery('');
                    setActiveTab(tab.id);
                  }}
                  onKeyDown={(e) => handleSidebarKeyNav(e, index)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto" ref={tabBarRef}>
            {/* Tab Panel Content */}
            <div
              role="tabpanel"
              id={`settings-panel-${activeTab}`}
              aria-labelledby={`settings-tab-${activeTab}`}
              className="px-5 pb-10 md:px-8"
            >
              {/* Staggered Content */}
              <motion.div
                key={activeTab}
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {tabContent}
                {!hasResults && (
                  <p className="settings-empty py-6">
                    Nothing in settings matches “{searchQuery}”.
                  </p>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </SettingsDrawerShell>

      {/* Auto-Save Toast */}
      <AutoSaveToast status={saveStatus} />
    </>
  );
}
