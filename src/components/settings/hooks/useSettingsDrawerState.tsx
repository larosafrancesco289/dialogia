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
import {
  DataPanel,
  type ImportKind,
  type PendingImport,
} from '@/components/settings/sections/DataPanel';
import { TAB_LIST } from '@/components/settings/sections/config';
import { NOTICE_EXPORTED_CHATS } from '@/lib/store/notices';
import { buildChatExport, prepareImport, type PreparedImport } from '@/lib/settings/transfer';
import type { ImportProgress } from '@/lib/historyImport/importHistory';
import { t } from '@/lib/i18n';
import { anyTurnActive } from '@/lib/ui/streaming';

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
  const [importing, setImporting] = useState<ImportKind | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [pendingImport, setPendingImport] = useState<
    (PendingImport & { prepared: PreparedImport }) | null
  >(null);

  const { setUI, setNotice, ui, loadModels, toggleFavoriteModel, favoriteModelIds, initializeApp } =
    useChatStore(
      (s) => ({
        setUI: s.setUI,
        setNotice: s.setNotice,
        ui: s.ui,
        loadModels: s.loadModels,
        toggleFavoriteModel: s.toggleFavoriteModel,
        favoriteModelIds: s.favoriteModelIds,
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
    setShowToolCallLog,
    showDebugRawJson,
    setShowDebugRawJson,
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
      setNotice(exportResult.error || t('data.exportFailed'));
      return;
    }
    try {
      const { filename, blob } = exportResult;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice(NOTICE_EXPORTED_CHATS, 'success');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('data.exportFailed');
      setNotice(message);
    }
  };

  const onImportPicked = async (file: File, kind: ImportKind) => {
    setImporting(kind);
    try {
      const result = await prepareImport(file, { historyOnly: kind === 'history' });
      if (!result.ok) {
        setNotice(result.error || t('data.importFailed'));
        return;
      }
      setPendingImport({
        name: file.name,
        kind,
        review: result.prepared.review,
        prepared: result.prepared,
      });
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : t('data.importFailed'));
    } finally {
      setImporting(null);
    }
  };

  const onConfirmImport = async () => {
    const pending = pendingImport;
    setPendingImport(null);
    if (!pending) return;
    // An import reloads every chat from disk, and a reply being written is
    // the store's, not the disk's yet: it would be lost from under its turn.
    if (anyTurnActive(useChatStore.getState().ui)) {
      setNotice(t('data.importWhileReplying'));
      return;
    }
    setImporting(pending.kind);
    try {
      const importResult = await pending.prepared.apply(setImportProgress);
      if (!importResult.ok) {
        setNotice(importResult.error || t('data.importFailed'));
        return;
      }
      await initializeApp();
      setNotice(importResult.notice, 'success');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('data.importFailed');
      setNotice(message);
    } finally {
      setImporting(null);
      setImportProgress(null);
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
        showToolCallLog={showToolCallLog}
        setShowToolCallLog={createAutoSaveSetter(setShowToolCallLog)}
        debugMode={!!ui?.debug?.mode}
        setDebugMode={(value: boolean) => {
          setUI({ debug: { mode: value } });
          markDirty();
        }}
        showDebugRawJson={showDebugRawJson}
        setShowDebugRawJson={createAutoSaveSetter(setShowDebugRawJson)}
      />
    ),
    data: (
      <DataPanel
        renderSection={renderSection}
        onExport={onExport}
        onImportPicked={onImportPicked}
        pendingImport={pendingImport}
        onConfirmImport={() => void onConfirmImport()}
        onCancelImport={() => setPendingImport(null)}
        importing={importing}
        importProgress={importProgress}
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
