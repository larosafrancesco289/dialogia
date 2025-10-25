'use client';
import type { ReactNode, Ref } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch, type ModelSearchHandle } from '@/components/ModelSearch';
import type { Chat } from '@/lib/types';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type ModelsPanelProps = {
  chat: Chat | undefined;
  favoriteModelIds?: string[];
  toggleFavoriteModel: (id: string) => void;
  updateChatSettings: (changes: Partial<Chat['settings']>) => Promise<void>;
  setUI: (ui: Partial<StoreState['ui']>) => void;
  loadModels: () => Promise<void>;
  hiddenModelIds?: string[];
  resetHiddenModels: () => void;
  renderSection: RenderSection;
  routePref: 'speed' | 'cost';
  setRoutePref: (pref: 'speed' | 'cost') => void;
  modelSearchRef: Ref<ModelSearchHandle | null>;
  experimentalBrave: boolean;
  ui: StoreState['ui'];
};

export function ModelsPanel(props: ModelsPanelProps) {
  const {
    chat,
    favoriteModelIds,
    toggleFavoriteModel,
    updateChatSettings,
    setUI,
    loadModels,
    hiddenModelIds,
    resetHiddenModels,
    renderSection,
    routePref,
    setRoutePref,
    modelSearchRef,
    experimentalBrave,
    ui,
  } = props;

  return (
    <>
      {renderSection(
        'models',
        'models',
        <SettingsSection title="Models">
          <div className="space-y-3">
            <ModelSearch
              ref={modelSearchRef}
              placeholder="Search models across providers (e.g. Claude, GPT-4o, Grok)"
              selectedIds={favoriteModelIds || []}
              clearOnSelect
              onSelect={(result) => {
                if (!favoriteModelIds?.includes(result.id)) toggleFavoriteModel(result.id);
                if (chat) {
                  updateChatSettings({ model: result.id }).catch(() => void 0);
                } else {
                  setUI({ nextModel: result.id });
                }
              }}
            />
            <div>
              <button className="btn btn-ghost" onClick={() => loadModels()}>
                Refresh model list
              </button>
            </div>
            {hiddenModelIds && hiddenModelIds.length > 0 && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <div className="text-muted-foreground">
                  {hiddenModelIds.length} hidden {hiddenModelIds.length === 1 ? 'model' : 'models'}
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => resetHiddenModels()}>
                  Reset hidden
                </button>
              </div>
            )}
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'models',
        'web-search',
        <SettingsSection title="Web Search">
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-sm block">Provider</label>
              <div className="segmented">
                {experimentalBrave && (
                  <button
                    className={`segment ${(((chat?.settings as any)?.search_provider as any) ?? (ui as any)?.nextSearchProvider ?? 'openrouter') === 'brave' ? 'is-active' : ''}`}
                    onClick={() => {
                      if (chat)
                        updateChatSettings({ search_provider: 'brave' } as any).catch(() => void 0);
                      else setUI({ nextSearchProvider: 'brave' } as any);
                    }}
                  >
                    Brave
                  </button>
                )}
                <button
                  className={`segment ${(((chat?.settings as any)?.search_provider as any) ?? (ui as any)?.nextSearchProvider ?? 'openrouter') === 'openrouter' ? 'is-active' : ''}`}
                  onClick={() => {
                    if (chat)
                      updateChatSettings({
                        search_provider: 'openrouter',
                      } as any).catch(() => void 0);
                    else setUI({ nextSearchProvider: 'openrouter' } as any);
                  }}
                >
                  OpenRouter
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {experimentalBrave
                  ? 'Brave uses local function-calling; OpenRouter injects the web plugin to include citations.'
                  : 'OpenRouter injects the web plugin to include citations.'}
              </div>
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'models',
        'routing',
        <SettingsSection title="Routing">
          <div className="space-y-2">
            <label className="text-sm block">Route preference</label>
            <div className="segmented">
              <button
                className={`segment ${routePref === 'speed' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoutePref('speed');
                  setUI({ routePreference: 'speed' });
                }}
              >
                Speed
              </button>
              <button
                className={`segment ${routePref === 'cost' ? 'is-active' : ''}`}
                onClick={() => {
                  setRoutePref('cost');
                  setUI({ routePreference: 'cost' });
                }}
              >
                Cost
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              Speed sorts by provider throughput; Cost sorts by price. OpenRouter routing uses this
              hint when selecting a provider for the chosen model.
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
