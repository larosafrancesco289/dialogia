import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import type { ModelSearchHandle } from '@/components/ModelSearch';
import type { SectionId, TabId } from '@/components/settings/types';
import { useSettingsFormState } from '@/components/settings/hooks/useSettingsFormState';
import { useSettingsNavigation } from '@/components/settings/hooks/useSettingsNavigation';
import {
  useSettingsAutoSave,
  type SettingsAutoSaveState,
} from '@/components/settings/hooks/useSettingsAutoSave';
import { ModelsPanel } from '@/components/settings/sections/ModelsPanel';
import { ProvidersPanel } from '@/components/settings/sections/ProvidersPanel';
import { ChatPanel } from '@/components/settings/sections/ChatPanel';
import { SettingsModuleSlot } from '@/components/ModuleSlot';
import { AppearancePanel } from '@/components/settings/sections/AppearancePanel';
import { DataPanel } from '@/components/settings/sections/DataPanel';
import { TAB_LIST } from '@/components/settings/sections/config';
import { NOTICE_EXPORTED_CHATS, NOTICE_IMPORTED_DATA } from '@/lib/store/notices';
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';

export type SettingsDrawerState = {
  closing: boolean;
  drawerRef: RefObject<HTMLDivElement>;
  tabBarRef: RefObject<HTMLDivElement>;
  sidebarRef: RefObject<HTMLElement>;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  activeSection: SectionId | null;
  navSections: SectionId[];
  scrollToSection: (sectionId: SectionId) => void;
  handleSidebarKeyNav: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  tabContent: ReactNode;
  closeWithAnim: () => void;
  saveStatus: SettingsAutoSaveState['saveStatus'];
};

export function useSettingsDrawerState(): SettingsDrawerState {
  const [closing, setClosing] = useState(false);

  const {
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
  const {
    system,
    setSystem,
    reasoningEffort,
    setReasoningEffort,
    reasoningTokens,
    setReasoningTokens,
    reasoningTokensStr,
    setReasoningTokensStr,
    showThinking,
    setShowThinking,
    showStats,
    setShowStats,
    showToolCallLog,
    showDebugRawJson,
    presets,
    setPresets,
    selectedPresetId,
    setSelectedPresetId,
  } = useSettingsFormState({ ui });

  const {
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
  } = useSettingsNavigation();

  const modelSearchRef = useRef<ModelSearchHandle | null>(null);

  const { saveStatus, markDirty, createAutoSaveSetter, flushPendingSave } = useSettingsAutoSave({
    setUI,
    system,
    reasoningEffort,
    reasoningTokens,
    showThinking,
    showStats,
    showToolCallLog,
    showDebugRawJson,
  });

  const closeWithAnim = useCallback(() => {
    void flushPendingSave();
    setClosing(true);
    window.setTimeout(() => setUI({ showSettings: false }), 190);
  }, [flushPendingSave, setUI]);

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
    const exportResult = await buildChatExport();
    if (!exportResult.ok) {
      setNotice(exportResult.error || 'Export failed');
      return;
    }
    try {
      const { filename, json } = exportResult;
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
      const importResult = await importChatExport(text);
      if (!importResult.ok) {
        setNotice(importResult.error || 'Import failed');
        return;
      }
      await initializeApp();
      setNotice(NOTICE_IMPORTED_DATA);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Import failed';
      setNotice(message);
    }
  };

  const panels: Record<TabId, ReactNode> = {
    connections: <ProvidersPanel renderSection={renderSection} loadModels={loadModels} />,
    models: (
      <ModelsPanel
        favoriteModelIds={favoriteModelIds}
        toggleFavoriteModel={toggleFavoriteModel}
        setUI={setUI}
        loadModels={loadModels}
        hiddenModelIds={hiddenModelIds}
        resetHiddenModels={resetHiddenModels}
        renderSection={renderSection}
        modelSearchRef={modelSearchRef}
        ui={ui}
        zdrOnly={ui?.zdrOnly}
        setZdrOnly={(value: boolean) => {
          setUI({ zdrOnly: value });
          markDirty();
        }}
      />
    ),
    chat: (
      <ChatPanel
        system={system}
        setSystem={createAutoSaveSetter(setSystem)}
        presets={presets}
        setPresets={setPresets}
        selectedPresetId={selectedPresetId}
        setSelectedPresetId={setSelectedPresetId}
        renderSection={renderSection}
        reasoningEffort={reasoningEffort}
        setReasoningEffort={createAutoSaveSetter(setReasoningEffort)}
        reasoningTokensStr={reasoningTokensStr}
        setReasoningTokensStr={setReasoningTokensStr}
        setReasoningTokens={createAutoSaveSetter(setReasoningTokens)}
        messageTimestamps={ui?.messageTimestamps}
        setMessageTimestamps={(value: boolean) => {
          setUI({ messageTimestamps: value });
          markDirty();
        }}
      />
    ),
    tutor: (
      <SettingsModuleSlot
        renderSection={renderSection}
        createAutoSaveSetter={createAutoSaveSetter}
      />
    ),
    appearance: (
      <AppearancePanel
        renderSection={renderSection}
        showThinking={showThinking}
        showStats={showStats}
        setShowThinking={createAutoSaveSetter(setShowThinking)}
        setShowStats={createAutoSaveSetter(setShowStats)}
      />
    ),
    data: (
      <DataPanel
        renderSection={renderSection}
        onExport={onExport}
        onImportPicked={onImportPicked}
      />
    ),
  };

  // A search runs through every tab (renderSection filters the sections), so
  // every panel mounts; otherwise only the chosen one.
  const tabContent = searchQuery.trim() ? (
    <>
      {TAB_LIST.map((tab) => (
        <Fragment key={tab.id}>{panels[tab.id]}</Fragment>
      ))}
    </>
  ) : (
    panels[activeTab]
  );

  return {
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
  };
}
