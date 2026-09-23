import type { Ref } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch, type ModelSearchHandle } from '@/components/ModelSearch';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { StoreState, UIStatePartial } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';
import { findModelById, formatModelLabel } from '@/lib/models';
import { getModelProviderLabel } from '@/lib/providers';
import { useChatStore } from '@/lib/store';
import { useDefaultModelId } from '@/lib/hooks/useModelCatalog';

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
  zdrOnly: boolean | undefined;
  setZdrOnly: (value: boolean) => void;
};

/**
 * Models: what a new chat starts with, the favorites the picker offers, and
 * which providers are allowed at all.
 */
export function ModelsPanel(props: ModelsPanelProps) {
  const {
    favoriteModelIds = [],
    toggleFavoriteModel,
    setUI,
    loadModels,
    hiddenModelIds,
    resetHiddenModels,
    renderSection,
    modelSearchRef,
    ui,
    zdrOnly,
    setZdrOnly,
  } = props;
  const models = useChatStore((s) => s.models);
  const defaultModelId = useDefaultModelId();
  const chosenModelId = ui.chatDefaults?.modelId;
  const nameOf = (id: string) =>
    formatModelLabel({ model: findModelById(models, id), fallbackId: id });

  return (
    <>
      {renderSection(
        'models',
        'default-model',
        <SettingsSection title="Default model">
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">
                {nameOf(chosenModelId || defaultModelId)}
              </div>
              <div className="settings-row-label-description">
                {chosenModelId
                  ? 'New chats follow the model you last chose.'
                  : 'New chats start here until you choose a model in a chat.'}
              </div>
            </div>
            <div className="settings-row-control flex gap-2">
              {chosenModelId && (
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setUI({ chatDefaults: { modelId: undefined } })}
                >
                  Reset
                </button>
              )}
              <button className="btn-ghost btn-sm" onClick={() => loadModels()}>
                Refresh list
              </button>
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'models',
        'favorites',
        <SettingsSection title="Favorites">
          <p className="field__hint -mt-2">
            The models the picker offers beside its recommendations.
          </p>
          {favoriteModelIds.length > 0 ? (
            <ul className="settings-list">
              {favoriteModelIds.map((id) => {
                const meta = findModelById(models, id);
                return (
                  <li key={id} className="settings-list__row">
                    <span className="min-w-0">
                      <span className="settings-list__name">{nameOf(id)}</span>
                      {meta && (
                        <span className="settings-list__meta">{getModelProviderLabel(meta)}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="icon-button icon-button--sm"
                      title="Remove from favorites"
                      aria-label={`Remove ${nameOf(id)} from favorites`}
                      onClick={() => toggleFavoriteModel(id)}
                    >
                      <XMarkIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="settings-empty">No favorites yet.</p>
          )}
          <ModelSearch
            ref={modelSearchRef}
            placeholder="Add a model"
            selectedIds={favoriteModelIds}
            clearOnSelect
            onSelect={(result) => {
              if (!favoriteModelIds.includes(result.id)) toggleFavoriteModel(result.id);
            }}
          />
          {hiddenModelIds && hiddenModelIds.length > 0 && (
            <div className="settings-row">
              <div className="settings-row-label">
                <div className="settings-row-label-description">
                  {hiddenModelIds.length} {hiddenModelIds.length === 1 ? 'model is' : 'models are'}{' '}
                  hidden from the picker.
                </div>
              </div>
              <button className="btn-outline btn-sm" onClick={() => resetHiddenModels()}>
                Show again
              </button>
            </div>
          )}
        </SettingsSection>,
      )}

      {renderSection(
        'models',
        'privacy',
        <SettingsSection title="Privacy">
          <ToggleSwitch
            checked={zdrOnly === true}
            onChange={(checked) => {
              setZdrOnly(checked);
              void loadModels();
            }}
            label="Zero data retention only"
            description="Offer only models from providers that do not keep your prompts."
          />
        </SettingsSection>,
      )}
    </>
  );
}
