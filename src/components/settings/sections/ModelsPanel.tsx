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
    ui,
  } = props;
  const selectedModelId = ui.chatDefaults?.modelId;

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
              }}
            />
            <div className="text-xs text-muted-foreground">
              Selecting a model adds it to your favorites.{' '}
              {selectedModelId
                ? `New chats start with ${selectedModelId}, following the model you last used.`
                : 'New chats use the default model until you pick a model in a chat.'}
            </div>
            {selectedModelId && (
              <div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setUI({
                      chatDefaults: {
                        modelId: undefined,
                      },
                    })
                  }
                >
                  Use the default model
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
    </>
  );
}
