'use client';
import { useChatStore } from '@/lib/store';
import { shallow } from 'zustand/shallow';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import type { ModelSearchHandle } from '@/components/ModelSearch';
import type { RenderSection } from '@/components/settings/types';
import { useSettingsTabs } from '@/components/settings/hooks/useSettingsTabs';
import { useSettingsScrollSync } from '@/components/settings/hooks/useSettingsScrollSync';
import { useSettingsFormState } from '@/components/settings/hooks/useSettingsFormState';
import { applySettingsSavePatch, buildSettingsSavePatch } from '@/components/settings/saveSettings';
import { TAB_LIST, TAB_SECTIONS, SECTION_TITLES } from '@/components/settings/sections/config';
import { ModelsPanel } from '@/components/settings/sections/ModelsPanel';
import { ChatPanel } from '@/components/settings/sections/ChatPanel';
import { TutorPanel } from '@/components/settings/sections/TutorPanel';
import { DisplayPanel } from '@/components/settings/sections/DisplayPanel';
import { PrivacyPanel } from '@/components/settings/sections/PrivacyPanel';
import { DataPanel } from '@/components/settings/sections/DataPanel';
import { LabsPanel } from '@/components/settings/sections/LabsPanel';
import { NOTICE_EXPORTED_CHATS, NOTICE_IMPORTED_DATA } from '@/lib/store/notices';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';

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
  const experimentalBrave = useChatStore((s) => !!s.ui.flags.experimentalBrave);
  const experimentalTutor = useChatStore((s) => !!s.ui.flags.experimentalTutor);
  const enableMultiModelChat = useChatStore((s) => !!s.ui.flags.enableMultiModelChat);

  const closeWithAnim = () => {
    setClosing(true);
    window.setTimeout(() => setUI({ showSettings: false }), 190);
  };

  // Prevent background scroll while drawer is open
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Load models for autocomplete on mount (if key configured)
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Focus model search shortly after opening for quick access
  useEffect(() => {
    const tid = window.setTimeout(() => {
      modelSearchRef.current?.focus();
    }, 80);
    return () => window.clearTimeout(tid);
  }, []);

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
    (tabId, sectionId, content) => {
      if (activeTab !== tabId) return null;
      return (
        <div
          key={sectionId}
          id={`settings-${sectionId}`}
          data-settings-section={sectionId}
          ref={registerSection(sectionId)}
          className="space-y-4"
        >
          {content}
        </div>
      );
    },
    [activeTab, registerSection],
  );

  const handleTabKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const next = (index + 1) % TAB_LIST.length;
        setActiveTab(TAB_LIST[next].id);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const prev = (index - 1 + TAB_LIST.length) % TAB_LIST.length;
        setActiveTab(TAB_LIST[prev].id);
      }
    },
    [setActiveTab],
  );

  const navSections = TAB_SECTIONS[activeTab] ?? [];
  const showDesktopNav = navSections.length > 1;

  return (
    <SettingsDrawerShell closing={closing} onClose={closeWithAnim} drawerRef={drawerRef}>
      <div
        ref={tabBarRef}
        className="flex items-center gap-2 overflow-x-auto border-b border-border glass sticky z-10 px-4"
        style={{ top: 'var(--header-height)', minHeight: 50 }}
        role="tablist"
        aria-label="Settings categories"
      >
        {TAB_LIST.map((tab, index) => (
          <button
            key={tab.id}
            id={`settings-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`settings-tabpanel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`shrink-0 px-3 py-2 text-sm rounded-full border transition-colors ${
              activeTab === tab.id
                ? 'bg-muted text-foreground border-border'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKey(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4 pb-24">
        <div className="md:flex md:items-start md:gap-6">
          {showDesktopNav && (
            <nav
              className="hidden md:block md:w-48 md:shrink-0 sticky"
              style={{ top: 'calc(var(--header-height) + 62px)' }}
              aria-label="In-page settings navigation"
            >
              <div className="flex flex-col gap-1">
                {navSections.map((sectionId) => (
                  <button
                    key={sectionId}
                    type="button"
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      activeSection === sectionId
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                    onClick={() => scrollToSection(sectionId)}
                  >
                    {SECTION_TITLES[sectionId] ?? sectionId}
                  </button>
                ))}
              </div>
            </nav>
          )}
          <div className="flex-1">
            {TAB_LIST.map((tab) => {
              const isActive = tab.id === activeTab;
              let tabContent: ReactNode = null;
              if (isActive) {
                switch (tab.id) {
                  case 'models':
                    tabContent = (
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
                    break;
                  case 'chat':
                    tabContent = (
                      <ChatPanel
                        chat={chat}
                        system={system}
                        setSystem={setSystem}
                        presets={presets}
                        setPresets={setPresets}
                        selectedPresetId={selectedPresetId}
                        setSelectedPresetId={setSelectedPresetId}
                        updateChatSettings={updateChatSettings}
                        renderSection={renderSection}
                        temperatureStr={temperatureStr}
                        setTemperatureStr={setTemperatureStr}
                        setTemperature={setTemperature}
                        topPStr={topPStr}
                        setTopPStr={setTopPStr}
                        setTopP={setTopP}
                        maxTokensStr={maxTokensStr}
                        setMaxTokensStr={setMaxTokensStr}
                        setMaxTokens={setMaxTokens}
                        reasoningEffort={reasoningEffort}
                        setReasoningEffort={setReasoningEffort}
                        reasoningTokensStr={reasoningTokensStr}
                        setReasoningTokensStr={setReasoningTokensStr}
                        setReasoningTokens={setReasoningTokens}
                      />
                    );
                    break;
                  case 'tutor':
                    tabContent = (
                      <TutorPanel
                        chat={chat}
                        renderSection={renderSection}
                        experimentalTutor={experimentalTutor}
                        setUI={setUI}
                        ui={ui}
                        updateChatSettings={updateChatSettings}
                        tutorDefaultModel={tutorDefaultModel}
                        setTutorDefaultModel={setTutorDefaultModel}
                      />
                    );
                    break;
                  case 'display':
                    tabContent = renderSection(
                      'display',
                      'display',
                      <DisplayPanel
                        showThinking={showThinking}
                        showStats={showStats}
                        showToolCallLog={showToolCallLog}
                        showDebugRawJson={showDebugRawJson}
                        enableMultiModelChat={enableMultiModelChat}
                        uiDebugMode={!!ui?.debug.mode}
                        setShowThinking={setShowThinking}
                        setShowStats={setShowStats}
                        setShowToolCallLog={setShowToolCallLog}
                        setShowDebugRawJson={setShowDebugRawJson}
                        setEnableMultiModelChat={(value: boolean) =>
                          setUI({ flags: { enableMultiModelChat: value } })
                        }
                        setDebugMode={(value: boolean) => setUI({ debug: { mode: value } })}
                      />,
                    );
                    break;
                  case 'privacy':
                    tabContent = renderSection(
                      'privacy',
                      'privacy',
                      <PrivacyPanel
                        zdrOnly={ui?.zdrOnly}
                        setZdrOnly={(value: boolean) => setUI({ zdrOnly: value })}
                        reloadModels={loadModels}
                      />,
                    );
                    break;
                  case 'data':
                    tabContent = renderSection(
                      'data',
                      'data',
                      <DataPanel onExport={onExport} onImportPicked={onImportPicked} />,
                    );
                    break;
                  case 'labs':
                    tabContent = (
                      <LabsPanel
                        renderSection={renderSection}
                        experimentalBrave={experimentalBrave}
                        setUI={setUI}
                      />
                    );
                    break;
                  default:
                    tabContent = null;
                }
              }
              return (
                <div
                  key={tab.id}
                  role="tabpanel"
                  id={`settings-tabpanel-${tab.id}`}
                  aria-labelledby={`settings-tab-${tab.id}`}
                  hidden={!isActive}
                  className={`space-y-6 ${isActive ? '' : 'hidden'}`}
                >
                  {isActive && (
                    <>
                      {navSections.length > 1 && (
                        <div className="md:hidden flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
                          {navSections.map((sectionId) => (
                            <button
                              key={sectionId}
                              type="button"
                              className={`shrink-0 px-3 py-2 text-sm rounded-full border transition-colors ${
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
                      {tabContent}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="px-6 flex items-center justify-center border-t border-border sticky bottom-0 glass"
        style={{
          minHeight: 72,
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <button
          className="btn w-full max-w-sm"
          onClick={() => {
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
              onClose: closeWithAnim,
            });
          }}
        >
          Save
        </button>
      </div>
    </SettingsDrawerShell>
  );
}
