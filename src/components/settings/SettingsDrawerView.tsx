import { motion } from 'framer-motion';
import { TAB_LIST, SECTION_TITLES } from '@/components/settings/sections/config';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
import { AutoSaveToast } from '@/components/settings/AutoSaveToast';
import type { StudyCondition } from '@/lib/types';
import type { SettingsDrawerState } from '@/components/settings/hooks/useSettingsDrawerState';

function conditionButtonClass(isActive: boolean): string {
  return `px-4 py-2 rounded-lg border transition-colors ${
    isActive
      ? 'bg-accent/10 border-accent font-semibold text-accent'
      : 'border-border text-muted-foreground hover:border-accent/50'
  }`;
}

function ConditionButton({
  condition,
  active,
  onChange,
}: {
  condition: StudyCondition;
  active: StudyCondition;
  onChange: (c: StudyCondition) => void;
}) {
  return (
    <button
      className={conditionButtonClass(active === condition)}
      onClick={() => onChange(condition)}
    >
      System {condition}
    </button>
  );
}

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
  isStudyTier,
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
  studyCondition,
  onStudyConditionChange,
}: SettingsDrawerState) {
  if (isStudyTier) {
    return (
      <SettingsDrawerShell
        closing={closing}
        onClose={closeWithAnim}
        drawerRef={drawerRef}
        searchQuery=""
        onSearchChange={() => {}}
      >
        <div className="flex items-center justify-center h-[calc(100%-var(--header-height))] p-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold mb-4">Study Configuration</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Select the study condition before beginning the session.
            </p>
            <div className="flex gap-3 justify-center">
              <ConditionButton
                condition="A"
                active={studyCondition}
                onChange={onStudyConditionChange}
              />
              <ConditionButton
                condition="B"
                active={studyCondition}
                onChange={onStudyConditionChange}
              />
            </div>
          </div>
        </div>
      </SettingsDrawerShell>
    );
  }

  return (
    <>
      <SettingsDrawerShell
        closing={closing}
        onClose={closeWithAnim}
        drawerRef={drawerRef}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      >
        <div className="flex h-[calc(100%-var(--header-height))]">
          {/* Persistent Sidebar Navigation (Desktop) */}
          <nav
            ref={sidebarRef}
            className="hidden md:flex flex-col w-48 shrink-0 border-r border-border p-3 sticky top-[var(--header-height)] h-fit"
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
              className="md:hidden flex gap-2 overflow-x-auto p-4 border-b border-border sticky top-0 bg-surface z-10"
              role="tablist"
              aria-label="Settings categories"
            >
              {TAB_LIST.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`shrink-0 px-3 py-2 text-sm rounded-full border transition-colors ${
                    activeTab === tab.id
                      ? 'bg-muted text-foreground border-border'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }`}
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
              className="p-4 md:p-6"
            >
              {/* Sub-section navigation for tabs with multiple sections */}
              {navSections.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-4 mb-2 -mx-1 px-1 md:hidden">
                  {navSections.map((sectionId) => (
                    <button
                      key={sectionId}
                      type="button"
                      className={`shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${
                        activeSection === sectionId
                          ? 'bg-muted text-foreground border-border'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
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
                className="space-y-2"
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
