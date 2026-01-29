import { motion } from 'framer-motion';
import { TAB_LIST, SECTION_TITLES } from '@/components/settings/sections/config';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
import { AutoSaveToast } from '@/components/settings/AutoSaveToast';
import type { StudyCondition } from '@/lib/types';
import type {
  SettingsDrawerState,
  StudySessionInfo,
} from '@/components/settings/hooks/useSettingsDrawerState';

function ConditionSelector({
  condition,
  active,
  onChange,
  disabled,
}: {
  condition: StudyCondition;
  active: StudyCondition;
  onChange: (c: StudyCondition) => void;
  disabled?: boolean;
}) {
  const isActive = active === condition;
  return (
    <button
      className={`
        relative flex-1 py-3 px-4 text-sm font-medium tracking-wide
        border transition-all duration-200
        ${
          isActive
            ? 'bg-[var(--color-accent)]/8 border-[var(--color-accent)] text-[var(--color-accent)]'
            : 'border-[var(--rule-subtle)] text-[var(--color-fg-muted)] hover:border-[var(--color-accent)]/40 hover:text-[var(--color-fg)]'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        first:rounded-l-lg last:rounded-r-lg
      `}
      onClick={() => !disabled && onChange(condition)}
      disabled={disabled}
    >
      <span className="relative z-10">Condition {condition}</span>
      {isActive && (
        <motion.div
          layoutId="condition-indicator"
          className="absolute inset-0 bg-[var(--color-accent)]/5 rounded-lg"
          initial={false}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
    </button>
  );
}

function SessionStatusCard({ info }: { info: StudySessionInfo }) {
  if (!info) return null;

  const startTime = new Date(info.startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="rounded-lg border border-[var(--rule-accent)] bg-[var(--marginalia-bg)] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)]">
            Session Active
          </span>
        </div>
        <span className="text-xs text-[var(--color-fg-muted)]">Started {startTime}</span>
      </div>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-lg font-semibold text-[var(--color-fg)]">{info.participantId}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Participant
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[var(--color-fg)]">{info.condition}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Condition
          </div>
        </div>
        <div>
          <div className="text-lg font-semibold text-[var(--color-accent)]">{info.entryCount}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-fg-muted)]">
            Events
          </div>
        </div>
      </div>
    </div>
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
  participantId,
  setParticipantId,
  studySessionInfo,
  onStartStudySession,
  onExportStudyLog,
  onResetForNextParticipant,
  isResetting,
}: SettingsDrawerState) {
  if (isStudyTier) {
    const hasActiveSession = !!studySessionInfo && !studySessionInfo.isEnded;
    const canStartSession = participantId.trim().length > 0 && !hasActiveSession;

    return (
      <SettingsDrawerShell
        closing={closing}
        onClose={closeWithAnim}
        drawerRef={drawerRef}
        searchQuery=""
        onSearchChange={() => {}}
      >
        <div className="flex flex-col h-[calc(100%-var(--header-height))] overflow-y-auto">
          <div className="flex-1 p-6 sm:p-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-[var(--color-accent)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                    />
                  </svg>
                </div>
                <h2
                  className="text-xl font-semibold text-[var(--color-fg)]"
                  style={{ fontFamily: 'var(--font-serif-assistant)' }}
                >
                  Study Session
                </h2>
              </div>
              <p className="text-sm text-[var(--color-fg-muted)] leading-relaxed">
                Configure participant details and manage session data collection.
              </p>
            </div>

            {/* Session Status (if active) */}
            {hasActiveSession && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <SessionStatusCard info={studySessionInfo} />
              </motion.div>
            )}

            {/* Configuration Form */}
            <div className="space-y-6">
              {/* Participant ID */}
              <div>
                <label
                  htmlFor="participant-id"
                  className="block text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)] mb-2"
                >
                  Participant ID
                </label>
                <input
                  id="participant-id"
                  type="text"
                  value={participantId}
                  onChange={(e) => setParticipantId(e.target.value)}
                  placeholder="e.g., P001"
                  disabled={hasActiveSession}
                  className={`
                    w-full px-4 py-3 rounded-lg border bg-transparent
                    text-[var(--color-fg)] placeholder:text-[var(--color-fg-muted)]/50
                    transition-colors duration-200
                    focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/20
                    ${
                      hasActiveSession
                        ? 'border-[var(--rule-subtle)] opacity-60 cursor-not-allowed'
                        : 'border-[var(--rule-subtle)] hover:border-[var(--color-fg-muted)]/30'
                    }
                  `}
                />
              </div>

              {/* Condition Selection */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)] mb-2">
                  Study Condition
                </label>
                <div className="flex">
                  <ConditionSelector
                    condition="A"
                    active={studyCondition}
                    onChange={onStudyConditionChange}
                    disabled={hasActiveSession}
                  />
                  <ConditionSelector
                    condition="B"
                    active={studyCondition}
                    onChange={onStudyConditionChange}
                    disabled={hasActiveSession}
                  />
                </div>
              </div>

              {/* Start Session Button (only if no active session) */}
              {!hasActiveSession && (
                <button
                  onClick={onStartStudySession}
                  disabled={!canStartSession}
                  className={`
                    w-full py-3 px-4 rounded-lg font-medium text-sm
                    transition-all duration-200
                    ${
                      canStartSession
                        ? 'bg-[var(--color-accent)] text-white hover:opacity-90 active:scale-[0.98]'
                        : 'bg-[var(--rule-subtle)] text-[var(--color-fg-muted)] cursor-not-allowed'
                    }
                  `}
                >
                  Start Session
                </button>
              )}
            </div>

            {/* Divider */}
            {hasActiveSession && <div className="my-8 border-t border-[var(--rule-subtle)]" />}

            {/* Data Management (only if session active) */}
            {hasActiveSession && (
              <div className="space-y-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)]">
                  Data Management
                </h3>

                <button
                  onClick={onExportStudyLog}
                  className="
                    w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg
                    border border-[var(--rule-subtle)] text-[var(--color-fg)]
                    hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/5
                    transition-all duration-200 text-sm font-medium
                  "
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Export Session Log
                </button>

                <button
                  onClick={onResetForNextParticipant}
                  disabled={isResetting}
                  className="
                    w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg
                    border border-amber-500/30 text-amber-600 dark:text-amber-400
                    hover:border-amber-500/50 hover:bg-amber-500/5
                    transition-all duration-200 text-sm font-medium
                    disabled:opacity-50 disabled:cursor-not-allowed
                  "
                >
                  {isResetting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Resetting...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                      </svg>
                      Reset for Next Participant
                    </>
                  )}
                </button>

                <p className="text-[11px] text-[var(--color-fg-muted)] text-center leading-relaxed">
                  Reset will export the current log, clear all app data, and reload.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 pt-0">
            <div className="text-center text-[10px] text-[var(--color-fg-muted)]/60 uppercase tracking-wider">
              Dialogia Research Study
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
