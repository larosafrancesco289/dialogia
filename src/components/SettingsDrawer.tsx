'use client';
import { useChatStore } from '@/lib/store';
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { DisplayPanel } from '@/components/settings/DisplayPanel';
import { PrivacyPanel } from '@/components/settings/PrivacyPanel';
import { DataPanel } from '@/components/settings/DataPanel';
import { ModelsPanel } from '@/components/settings/ModelsPanel';
import { ChatPanel } from '@/components/settings/ChatPanel';
import { TutorPanel } from '@/components/settings/TutorPanel';
import { LabsPanel } from '@/components/settings/LabsPanel';
import type { TabId, RenderSection } from '@/components/settings/types';
import { IconButton } from '@/components/IconButton';
import type { ModelSearchHandle } from '@/components/ModelSearch';
import { XCircleIcon } from '@heroicons/react/24/outline';
import {
  getSystemPresets,
  addSystemPreset,
  updateSystemPreset,
  deleteSystemPreset,
  type SystemPreset,
} from '@/lib/presets';
import { DEFAULT_TUTOR_MODEL_ID } from '@/lib/constants';
import { useSettingsTabs } from '@/components/settings/useSettingsTabs';

const TAB_LIST: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'models', label: 'Models' },
  { id: 'chat', label: 'Chat' },
  { id: 'tutor', label: 'Tutor' },
  { id: 'display', label: 'Display' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'data', label: 'Data' },
  { id: 'labs', label: 'Labs' },
];

const TAB_SECTIONS: Record<TabId, string[]> = {
  models: ['models', 'web-search', 'routing'],
  chat: ['general', 'generation', 'reasoning'],
  tutor: ['tutor'],
  display: ['display', 'debug'],
  privacy: ['privacy'],
  data: ['data'],
  labs: ['experimental'],
};

const SECTION_TITLES: Record<string, string> = {
  models: 'Models',
  'web-search': 'Web Search',
  routing: 'Routing',
  general: 'General',
  generation: 'Generation',
  reasoning: 'Reasoning',
  tutor: 'Tutor',
  display: 'Display',
  debug: 'Debug',
  privacy: 'Privacy',
  data: 'Data',
  experimental: 'Experimental',
};

export function SettingsDrawer() {
  const {
    chats,
    selectedChatId,
    updateChatSettings,
    setUI,
    ui,
    loadModels,
    toggleFavoriteModel,
    favoriteModelIds,
    models,
    hiddenModelIds,
    resetHiddenModels,
    initializeApp,
    zdrModelIds,
    zdrProviderIds,
  } = useChatStore();
  const chat = chats.find((c) => c.id === selectedChatId);
  const [system, setSystem] = useState(chat?.settings.system ?? '');
  const [temperature, setTemperature] = useState<number | undefined>(chat?.settings.temperature);
  const [top_p, setTopP] = useState<number | undefined>(chat?.settings.top_p);
  const [max_tokens, setMaxTokens] = useState<number | undefined>(chat?.settings.max_tokens);
  // Local string mirrors to avoid type=number focus/validation quirks
  const [temperatureStr, setTemperatureStr] = useState<string>(
    chat?.settings.temperature != null ? String(chat.settings.temperature) : '',
  );
  const [topPStr, setTopPStr] = useState<string>(
    chat?.settings.top_p != null ? String(chat.settings.top_p) : '',
  );
  const [maxTokensStr, setMaxTokensStr] = useState<string>(
    chat?.settings.max_tokens != null ? String(chat.settings.max_tokens) : '',
  );
  const [reasoningEffort, setReasoningEffort] = useState<
    'none' | 'low' | 'medium' | 'high' | undefined
  >(chat?.settings.reasoning_effort);
  const [reasoningTokens, setReasoningTokens] = useState<number | undefined>(
    chat?.settings.reasoning_tokens,
  );
  const [reasoningTokensStr, setReasoningTokensStr] = useState<string>(
    chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
  );
  const [tutorDefaultModel, setTutorDefaultModel] = useState<string>(
    ui?.tutorDefaultModelId || DEFAULT_TUTOR_MODEL_ID,
  );
  const [showThinking, setShowThinking] = useState<boolean>(
    chat?.settings.show_thinking_by_default ?? false,
  );
  const [showStats, setShowStats] = useState<boolean>(chat?.settings.show_stats ?? false);
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
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const modelSearchRef = useRef<ModelSearchHandle | null>(null);
  const [routePref, setRoutePref] = useState<'speed' | 'cost'>(
    (useChatStore.getState().ui.routePreference as any) || 'speed',
  );
  const experimentalBrave = useChatStore((s) => !!s.ui.experimentalBrave);
  const experimentalDeepResearch = useChatStore((s) => !!s.ui.experimentalDeepResearch);
  const experimentalTutor = useChatStore((s) => !!s.ui.experimentalTutor);
  const enableMultiModelChat = useChatStore((s) => !!s.ui.enableMultiModelChat);
  // System prompt presets
  const [presets, setPresets] = useState<SystemPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const closeWithAnim = () => {
    setClosing(true);
    window.setTimeout(() => setUI({ showSettings: false }), 190);
  };

  // Keep local state in sync when switching chats or reopening the drawer
  useEffect(() => {
    // When switching chats, sync drawer fields from the selected chat
    setSystem(chat?.settings.system ?? '');
    setTemperature(chat?.settings.temperature);
    setTopP(chat?.settings.top_p);
    setMaxTokens(chat?.settings.max_tokens);
    setTemperatureStr(chat?.settings.temperature != null ? String(chat.settings.temperature) : '');
    setTopPStr(chat?.settings.top_p != null ? String(chat.settings.top_p) : '');
    setMaxTokensStr(chat?.settings.max_tokens != null ? String(chat.settings.max_tokens) : '');
    setReasoningEffort(chat?.settings.reasoning_effort);
    setReasoningTokens(chat?.settings.reasoning_tokens);
    setReasoningTokensStr(
      chat?.settings.reasoning_tokens != null ? String(chat.settings.reasoning_tokens) : '',
    );
    setShowThinking(chat?.settings.show_thinking_by_default ?? false);
    setShowStats(chat?.settings.show_stats ?? false);
    setTutorDefaultModel(ui?.tutorDefaultModelId || DEFAULT_TUTOR_MODEL_ID);
  }, [
    chat?.id,
    ui?.tutorDefaultModelId,
  ]);

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
      try {
        modelSearchRef.current?.focus();
      } catch {}
    }, 80);
    return () => window.clearTimeout(tid);
  }, []);

  // Load saved system prompt presets on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      const list = await getSystemPresets();
      if (!mounted) return;
      // Sort alphabetically for stable UI
      const sorted = list.slice().sort((a, b) => a.name.localeCompare(b.name));
      setPresets(sorted);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onExport = async () => {
    try {
      const { exportAll } = await import('@/lib/db');
      const data = await exportAll();
      const text = JSON.stringify(data, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const name = `dialogia-backup-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(
        ts.getDate(),
      )}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setUI({ notice: 'Exported chats to JSON' });
    } catch (e: any) {
      setUI({ notice: e?.message || 'Export failed' });
    }
  };

  const onImportPicked = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { importAll } = await import('@/lib/db');
      await importAll(json);
      await initializeApp();
      setUI({ notice: 'Imported data' });
    } catch (e: any) {
      setUI({ notice: e?.message || 'Import failed' });
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

  const scrollToSection = useCallback((sectionId: string) => {
    const container = drawerRef.current;
    const target = sectionRefs.current[sectionId];
    if (!container || !target) return;

    const header = container.querySelector('[data-settings-header]') as HTMLElement | null;
    const headerHeight = header?.offsetHeight ?? 0;
    const tabBarHeight = tabBarRef.current?.offsetHeight ?? 0;
    const offset = headerHeight + tabBarHeight + 16;

    const prefersReducedMotion =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    container.scrollTo({
      top: Math.max(0, target.offsetTop - offset),
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
    setActiveSection(sectionId);
  }, []);

  const handleTabKey = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = (index + 1) % TAB_LIST.length;
      setActiveTab(TAB_LIST[next].id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = (index - 1 + TAB_LIST.length) % TAB_LIST.length;
      setActiveTab(TAB_LIST[prev].id);
    }
  }, []);

  useEffect(() => {
    const firstSection = TAB_SECTIONS[activeTab]?.[0] ?? null;
    setActiveSection(firstSection);
    if (drawerRef.current) {
      drawerRef.current.scrollTo({ top: 0 });
    }
  }, [activeTab]);

  useEffect(() => {
    const container = drawerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const id = visible[0].target.getAttribute('data-settings-section');
        if (id && id !== activeSection) {
          setActiveSection(id);
        }
      },
      {
        root: container,
        threshold: 0.3,
        rootMargin: '-80px 0px -55% 0px',
      },
    );

    const subscription = TAB_SECTIONS[activeTab] ?? [];
    subscription.forEach((id) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [activeTab]);

  const navSections = TAB_SECTIONS[activeTab] ?? [];
  const showDesktopNav = navSections.length > 1;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/30 z-[70] settings-overlay${closing ? ' is-closing' : ''}`}
        onClick={closeWithAnim}
        aria-hidden
      />
      <div
        ref={drawerRef}
        className={`fixed inset-y-0 right-0 w-full sm:w-[640px] glass-panel border-l border-border shadow-[var(--shadow-card)] z-[80] overflow-y-auto will-change-transform settings-drawer${closing ? ' is-closing' : ''}`}
        style={{ overscrollBehavior: 'contain' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === 'Escape') closeWithAnim();
        }}
      >
        {/* Header */}
        <div
          data-settings-header
          className="flex items-center gap-3 border-b border-border sticky top-0 glass z-10 px-4"
          style={{ height: 'var(--header-height)' }}
        >
          <h3 id="settings-title" className="font-semibold">
            Settings
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <IconButton title="Close" onClick={closeWithAnim} className="w-11 h-11 sm:w-9 sm:h-9">
              <XCircleIcon className="h-6 w-6" />
            </IconButton>
          </div>
        </div>

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
                          routePref={routePref}
                          setRoutePref={setRoutePref}
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
                          enableMultiModelChat={enableMultiModelChat}
                          uiDebugMode={!!ui?.debugMode}
                          setShowThinking={setShowThinking}
                          setShowStats={setShowStats}
                          setEnableMultiModelChat={(value: boolean) =>
                            setUI({ enableMultiModelChat: value })
                          }
                          setDebugMode={(value: boolean) => setUI({ debugMode: value })}
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
                          experimentalDeepResearch={experimentalDeepResearch}
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

        {/* Sticky footer */}
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
              const trimmedTutorModel = tutorDefaultModel.trim() || DEFAULT_TUTOR_MODEL_ID;
              setUI({
                tutorDefaultModelId: trimmedTutorModel,
              });
              if (chat) {
                updateChatSettings({
                  system,
                  temperature,
                  top_p,
                  max_tokens,
                  reasoning_effort: (reasoningEffort || undefined) as any,
                  reasoning_tokens: reasoningTokens,
                  show_thinking_by_default: showThinking,
                  show_stats: showStats,
                  ...(chat.settings.tutor_mode || ui?.forceTutorMode
                    ? {
                        tutor_default_model: trimmedTutorModel,
                      }
                    : {}),
                });
              } else {
                setUI({
                  nextSystem: system,
                  nextTemperature: temperature,
                  nextTopP: top_p,
                  nextMaxTokens: max_tokens,
                  nextReasoningEffort: (reasoningEffort || undefined) as any,
                  nextReasoningTokens: reasoningTokens,
                  nextShowThinking: showThinking,
                  nextShowStats: showStats,
                  nextSearchProvider:
                    (ui as any)?.nextSearchProvider ??
                    (chat as any)?.settings?.search_provider ??
                    'openrouter',
                });
              }
              closeWithAnim();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );
}
