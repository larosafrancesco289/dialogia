import { motion } from 'framer-motion';
import { TAB_LIST, SECTION_TITLES } from '@/components/settings/sections/config';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
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

export function SettingsDrawerView({
  closing,
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
  tabContent,
  closeWithAnim,
  saveStatus,
}: SettingsDrawerState) {
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
            className="settings-nav hidden md:flex flex-col w-48 shrink-0 p-3 sticky top-[var(--chrome-height)] h-fit"
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
                  aria-selected={activeTab === tab.id}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  className={`settings-sidebar-item ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleSidebarKeyNav(e, index)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto" ref={tabBarRef}>
            {/* Mobile Tab Pills */}
            <div
              className="settings-tabs md:hidden"
              role="tablist"
              aria-label="Settings categories"
            >
              {TAB_LIST.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`settings-tab${activeTab === tab.id ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Panel Content */}
            <div
              role="tabpanel"
              id={`settings-panel-${activeTab}`}
              aria-labelledby={`settings-tab-${activeTab}`}
              className="px-5 pb-10 md:px-8"
            >
              {/* Sub-section navigation for tabs with multiple sections */}
              {navSections.length > 1 && (
                <div className="settings-subnav md:hidden">
                  {navSections.map((sectionId) => (
                    <button
                      key={sectionId}
                      type="button"
                      className={`settings-subnav__item${activeSection === sectionId ? ' is-active' : ''}`}
                      onClick={() => scrollToSection(sectionId)}
                    >
                      {SECTION_TITLES[sectionId] ?? sectionId}
                    </button>
                  ))}
                </div>
              )}

              {/* Staggered Content */}
              <motion.div
                key={activeTab}
                variants={staggerContainer}
                initial="hidden"
                animate="show"
              >
                {tabContent}
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
