'use client';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import { motion } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ModelSearchHandle } from '@/components/ModelSearch';
import type { RenderSection, TabId, SectionId } from '@/components/settings/types';
import { useSettingsTabs } from '@/components/settings/hooks/useSettingsTabs';
import { useSettingsScrollSync } from '@/components/settings/hooks/useSettingsScrollSync';
import { useSettingsFormState } from '@/components/settings/hooks/useSettingsFormState';
import { useAutoSave } from '@/components/settings/hooks/useAutoSave';
import { applySettingsSavePatch, buildSettingsSavePatch } from '@/components/settings/saveSettings';
import { TAB_LIST, TAB_SECTIONS, SECTION_TITLES } from '@/components/settings/sections/config';
import { ModelsPanel } from '@/components/settings/sections/ModelsPanel';
import { ChatPanel } from '@/components/settings/sections/ChatPanel';
import { TutorPanel } from '@/components/settings/sections/TutorPanel';
import { AppearancePanel } from '@/components/settings/sections/AppearancePanel';
import { AdvancedPanel } from '@/components/settings/sections/AdvancedPanel';
import { NOTICE_EXPORTED_CHATS, NOTICE_IMPORTED_DATA } from '@/lib/store/notices';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
import { AutoSaveToast } from '@/components/settings/AutoSaveToast';
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';
import { springs } from '@/lib/mobile/springConfig';

// Animation variants for staggered content
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: springs.gentle,
  },
};

export function SettingsDrawer() {
  const {
    chats,
    selectedChatId,
    updateChatSettings,
    setUI,
    setNotice,
    ui,
    loadModels,
    toggleFavoriteModel,
    favoriteModelIds,
    hiddenModelIds,
    resetHiddenModels,
    initializeApp,
  } = useChatStore(
    (s) => ({
      chats: s.chats,
      selectedChatId: s.selectedChatId,
      updateChatSettings: s.updateChatSettings,
      setUI: s.setUI,
      setNotice: s.setNotice,
      ui: s.ui,
      loadModels: s.loadModels,
      toggleFavoriteModel: s.toggleFavoriteModel,
      favoriteModelIds: s.favoriteModelIds,
      hiddenModelIds: s.hiddenModelIds,
      resetHiddenModels: s.resetHiddenModels,
      initializeApp: s.initializeApp,
    }),
    shallow,
  );
  const chat = chats.find((c) => c.id === selectedChatId);

  const {
    system,
    setSystem,
    temperature,
    setTemperature,
    topP,
    setTopP,
    maxTokens,
    setMaxTokens,
    temperatureStr,
    setTemperatureStr,
    topPStr,
    setTopPStr,
    maxTokensStr,
    setMaxTokensStr,
    reasoningEffort,
    setReasoningEffort,
    reasoningTokens,
    setReasoningTokens,
    reasoningTokensStr,
    setReasoningTokensStr,
    tutorDefaultModel,
    setTutorDefaultModel,
    showThinking,
    setShowThinking,
    showStats,
    setShowStats,
    showToolCallLog,
    setShowToolCallLog,
    showDebugRawJson,
    setShowDebugRawJson,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
  } = useSettingsFormState({ chat, ui });

  const [closing, setClosing] = useState(false);
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

  const modelSearchRef = useRef<ModelSearchHandle | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const experimentalBrave = useChatStore((s) => !!s.ui.flags.experimentalBrave);
  const experimentalTutor = useChatStore((s) => !!s.ui.flags.experimentalTutor);
  const enableMultiModelChat = useChatStore((s) => !!s.ui.flags.enableMultiModelChat);

  // Auto-save hook
  const performSave = useCallback(() => {
    const patch = buildSettingsSavePatch({
      chat,
      ui,
      system,
      temperature,
      topP,
      maxTokens,
      reasoningEffort,
      reasoningTokens,
      showThinking,
      showStats,
      showToolCallLog,
      showDebugRawJson,
      tutorDefaultModel,
    });
    applySettingsSavePatch({
      patch,
      setUI,
      updateChatSettings,
    });
  }, [
    chat,
    ui,
    system,
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
    reasoningTokens,
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
    tutorDefaultModel,
    setUI,
    updateChatSettings,
  ]);

  const { status: saveStatus, markDirty } = useAutoSave({
    delay: 600,
    onSave: performSave,
  });

  // Wrap setters to trigger auto-save
  const createAutoSaveSetter = <T,>(setter: (v: T) => void) => {
    return (value: T) => {
      setter(value);
      markDirty();
    };
  };

  const closeWithAnim = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => setUI({ showSettings: false }), 190);
  }, [setUI]);

  // Prevent background scroll while drawer is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Load models for autocomplete on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const onExport = async () => {
    try {
      const { filename, json } = await buildChatExport();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(NOTICE_EXPORTED_CHATS);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Export failed';
      setNotice(message);
    }
  };

  const onImportPicked = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      await importChatExport(text);
      await initializeApp();
      setNotice(NOTICE_IMPORTED_DATA);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Import failed';
      setNotice(message);
    }
  };

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

  // Keyboard navigation for sidebar
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'models-routing':
        return (
          <ModelsPanel
            chat={chat}
            favoriteModelIds={favoriteModelIds}
            toggleFavoriteModel={toggleFavoriteModel}
            updateChatSettings={updateChatSettings}
            setUI={setUI}
            loadModels={loadModels}
            hiddenModelIds={hiddenModelIds}
            resetHiddenModels={resetHiddenModels}
            renderSection={renderSection}
            modelSearchRef={modelSearchRef}
            experimentalBrave={experimentalBrave}
            ui={ui}
          />
        );
      case 'chat':
        return (
          <ChatPanel
            chat={chat}
            system={system}
            setSystem={createAutoSaveSetter(setSystem)}
            presets={presets}
            setPresets={setPresets}
            selectedPresetId={selectedPresetId}
            setSelectedPresetId={setSelectedPresetId}
            updateChatSettings={updateChatSettings}
            renderSection={renderSection}
            temperatureStr={temperatureStr}
            setTemperatureStr={setTemperatureStr}
            setTemperature={createAutoSaveSetter(setTemperature)}
            topPStr={topPStr}
            setTopPStr={setTopPStr}
            setTopP={createAutoSaveSetter(setTopP)}
            maxTokensStr={maxTokensStr}
            setMaxTokensStr={setMaxTokensStr}
            setMaxTokens={createAutoSaveSetter(setMaxTokens)}
            reasoningEffort={reasoningEffort}
            setReasoningEffort={createAutoSaveSetter(setReasoningEffort)}
            reasoningTokensStr={reasoningTokensStr}
            setReasoningTokensStr={setReasoningTokensStr}
            setReasoningTokens={createAutoSaveSetter(setReasoningTokens)}
          />
        );
      case 'tutor':
        return (
          <TutorPanel
            chat={chat}
            renderSection={renderSection}
            experimentalTutor={experimentalTutor}
            setUI={setUI}
            ui={ui}
            updateChatSettings={updateChatSettings}
            tutorDefaultModel={tutorDefaultModel}
            setTutorDefaultModel={createAutoSaveSetter(setTutorDefaultModel)}
          />
        );
      case 'appearance':
        return (
          <AppearancePanel
            renderSection={renderSection}
            showThinking={showThinking}
            showStats={showStats}
            showToolCallLog={showToolCallLog}
            showDebugRawJson={showDebugRawJson}
            enableMultiModelChat={enableMultiModelChat}
            uiDebugMode={!!ui?.debug.mode}
            setShowThinking={createAutoSaveSetter(setShowThinking)}
            setShowStats={createAutoSaveSetter(setShowStats)}
            setShowToolCallLog={createAutoSaveSetter(setShowToolCallLog)}
            setShowDebugRawJson={createAutoSaveSetter(setShowDebugRawJson)}
            setEnableMultiModelChat={(value: boolean) => {
              setUI({ flags: { enableMultiModelChat: value } });
              markDirty();
            }}
            setDebugMode={(value: boolean) => {
              setUI({ debug: { mode: value } });
              markDirty();
            }}
            zdrOnly={ui?.zdrOnly}
            setZdrOnly={(value: boolean) => {
              setUI({ zdrOnly: value });
              markDirty();
            }}
            reloadModels={loadModels}
          />
        );
      case 'advanced':
        return (
          <AdvancedPanel
            renderSection={renderSection}
            onExport={onExport}
            onImportPicked={onImportPicked}
            experimentalBrave={experimentalBrave}
            setUI={setUI}
            uiDebugMode={!!ui?.debug.mode}
            showToolCallLog={showToolCallLog}
            showDebugRawJson={showDebugRawJson}
            setDebugMode={(value: boolean) => {
              setUI({ debug: { mode: value } });
              markDirty();
            }}
            setShowToolCallLog={createAutoSaveSetter(setShowToolCallLog)}
            setShowDebugRawJson={createAutoSaveSetter(setShowDebugRawJson)}
          />
        );
      default:
        return null;
    }
  };

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
                {renderTabContent()}
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
