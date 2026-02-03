'use client';
import {
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
import { useIsStudyTier } from '@/lib/auth/tierContext';
import type { StudyCondition } from '@/lib/types';
import type { ModelSearchHandle } from '@/components/ModelSearch';
import type { SectionId, TabId } from '@/components/settings/types';
import { useSettingsFormState } from '@/components/settings/hooks/useSettingsFormState';
import { useSettingsNavigation } from '@/components/settings/hooks/useSettingsNavigation';
import {
  useSettingsAutoSave,
  type SettingsAutoSaveState,
} from '@/components/settings/hooks/useSettingsAutoSave';
import {
  useStudySessionControls,
  type StudySessionInfo,
} from '@/components/settings/hooks/useStudySessionControls';
import { ModelsPanel } from '@/components/settings/sections/ModelsPanel';
import { ChatPanel } from '@/components/settings/sections/ChatPanel';
import { TutorPanel } from '@/components/settings/sections/TutorPanel';
import { AppearancePanel } from '@/components/settings/sections/AppearancePanel';
import { AdvancedPanel } from '@/components/settings/sections/AdvancedPanel';
import { NOTICE_EXPORTED_CHATS, NOTICE_IMPORTED_DATA } from '@/lib/store/notices';
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';

export type SettingsDrawerState = {
  isStudyTier: boolean;
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
  studyCondition: StudyCondition;
  onStudyConditionChange: (c: StudyCondition) => void;
  participantId: string;
  setParticipantId: (id: string) => void;
  studySessionInfo: StudySessionInfo;
  onStartStudySession: () => void;
  onExportStudyLog: () => void;
  onResetForNextParticipant: () => void;
  isResetting: boolean;
};

export type { StudySessionInfo };

export function useSettingsDrawerState(): SettingsDrawerState {
  const isStudyTier = useIsStudyTier();
  const [closing, setClosing] = useState(false);

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

  const experimentalBrave = useChatStore((s) => !!s.ui.flags.experimentalBrave);
  const experimentalTutor = useChatStore((s) => !!s.ui.flags.experimentalTutor);
  const enableMultiModelChat = useChatStore((s) => !!s.ui.flags.enableMultiModelChat);

  const {
    studyCondition,
    onStudyConditionChange,
    participantId,
    setParticipantId,
    studySessionInfo,
    onStartStudySession,
    onExportStudyLog,
    onResetForNextParticipant,
    isResetting,
  } = useStudySessionControls();

  const { saveStatus, markDirty, createAutoSaveSetter } = useSettingsAutoSave({
    chat,
    ui,
    setUI,
    updateChatSettings,
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

  const tabContent = (() => {
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
  })();

  return {
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
  };
}
