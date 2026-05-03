'use client';
import type { Ref } from 'react';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch, type ModelSearchHandle } from '@/components/ModelSearch';
import type { StoreState, UIStatePartial } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';

type ModelsPanelProps = {
  favoriteModelIds?: string[];
  toggleFavoriteModel: (id: string) => void;
  setUI: (ui: UIStatePartial) => void;
  loadModels: () => Promise<void>;
  hiddenModelIds?: string[];
  resetHiddenModels: () => void;
  renderSection: RenderSection;
  modelSearchRef: Ref<ModelSearchHandle | null>;
  experimentalBrave: boolean;
  ui: StoreState['ui'];
};

export function ModelsPanel(props: ModelsPanelProps) {
  const {
    favoriteModelIds,
    toggleFavoriteModel,
    setUI,
    loadModels,
    hiddenModelIds,
    resetHiddenModels,
    renderSection,
    modelSearchRef,
    experimentalBrave,
    ui,
  } = props;
  const routePref = ui.routePreference ?? 'balanced';
  const selectedModelId = ui.chatDefaults?.modelId;
  const searchProvider = ui.chatDefaults?.features?.search?.provider ?? 'openrouter';

  return (
    <>
      {renderSection(
        'models-routing',
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
                setUI({ chatDefaults: { modelId: result.id, parallelModels: [] } });
              }}
            />
            <div className="text-xs text-muted-foreground">
              {selectedModelId
                ? `New chats start with ${selectedModelId}.`
                : 'New chats use the tier default. Pick a model to override.'}{' '}
              Switch models inside a chat from the composer.
            </div>
            {selectedModelId && (
              <div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setUI({
                      chatDefaults: {
                        modelId: undefined,
                        parallelModels: undefined,
                      },
                    })
                  }
                >
                  Use tier default
                </button>
              </div>
            )}
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
        'models-routing',
        'web-search',
        <SettingsSection title="Web Search">
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-sm block">Provider</label>
              <div className="segmented">
                {experimentalBrave && (
                  <button
                    className={`segment ${searchProvider === 'brave' ? 'is-active' : ''}`}
                    onClick={() => {
                      setUI({ chatDefaults: { features: { search: { provider: 'brave' } } } });
                    }}
                  >
                    Brave
                  </button>
                )}
                <button
                  className={`segment ${searchProvider === 'openrouter' ? 'is-active' : ''}`}
                  onClick={() => {
                    setUI({
                      chatDefaults: { features: { search: { provider: 'openrouter' } } },
                    });
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
        'models-routing',
        'routing',
        <SettingsSection title="Routing">
          <div className="space-y-2">
            <label className="text-sm block">Route preference</label>
            <div className="segmented">
              <button
                className={`segment ${routePref === 'balanced' ? 'is-active' : ''}`}
                onClick={() => {
                  setUI({ routePreference: 'balanced' });
                }}
              >
                Balanced
              </button>
              <button
                className={`segment ${routePref === 'speed' ? 'is-active' : ''}`}
                onClick={() => {
                  setUI({ routePreference: 'speed' });
                }}
              >
                Speed
              </button>
              <button
                className={`segment ${routePref === 'cost' ? 'is-active' : ''}`}
                onClick={() => {
                  setUI({ routePreference: 'cost' });
                }}
              >
                Cost
              </button>
            </div>
            <div className="text-xs text-muted-foreground">
              Balanced leaves OpenRouter default routing on. Speed and Cost set explicit provider
              sorting for the chosen model.
            </div>
          </div>
        </SettingsSection>,
      )}
    </>
  );
}
