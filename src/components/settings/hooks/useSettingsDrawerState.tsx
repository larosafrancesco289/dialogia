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
import { motion } from 'framer-motion';
import { shallow } from 'zustand/shallow';
import { useChatStore } from '@/lib/store';
import { useIsStudyTier } from '@/lib/auth/tierContext';
import { selectStudyCondition } from '@/lib/store/selectors';
import type { StudyCondition } from '@/lib/types';
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
import { buildChatExport, importChatExport } from '@/lib/settings/transfer';
import { springs } from '@/lib/mobile/springConfig';
import type { SessionSummary } from '@/lib/study';
import {
  getParticipantId,
  initializeSession,
  downloadStudyLog,
  getSessionSummary,
  resetForNextParticipant,
} from '@/lib/study';

const staggerItem = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: springs.gentle,
  },
};

export type StudySessionInfo = SessionSummary | null;

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
  saveStatus: ReturnType<typeof useAutoSave>['status'];
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

export function useSettingsDrawerState(): SettingsDrawerState {
  const isStudyTier = useIsStudyTier();
  const [closing, setClosing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const studyCondition = useChatStore(selectStudyCondition);
  const onStudyConditionChange = useCallback(
    (c: StudyCondition) => {
      setUI({ tutor: { studyCondition: c } });
    },
    [setUI],
  );

  // Study session state
  const [participantId, setParticipantIdState] = useState(() => getParticipantId() || '');
  const [studySessionInfo, setStudySessionInfo] = useState<StudySessionInfo>(() =>
    getSessionSummary(),
  );
  const [isResetting, setIsResetting] = useState(false);

  // Refresh session info periodically while drawer is open
  useEffect(() => {
    const interval = setInterval(() => {
      setStudySessionInfo(getSessionSummary());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const onStartStudySession = useCallback(() => {
    const trimmedId = participantId.trim();
    if (!trimmedId) return;
    initializeSession(trimmedId, studyCondition);
    setStudySessionInfo(getSessionSummary());
  }, [participantId, studyCondition]);

  const onResetForNextParticipant = useCallback(async () => {
    const confirmed = window.confirm(
      'This will export the current log, clear all data, and reload the app. Continue?',
    );
    if (!confirmed) return;
    setIsResetting(true);
    await resetForNextParticipant({ exportBeforeReset: true });
  }, []);

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
    setParticipantId: setParticipantIdState,
    studySessionInfo,
    onStartStudySession,
    onExportStudyLog: downloadStudyLog,
    onResetForNextParticipant,
    isResetting,
  };
}
