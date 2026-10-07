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
import { useT } from '@/lib/i18n';

type ModelsPanelProps = {
  favoriteModelIds?: string[];
  toggleFavoriteModel: (id: string) => void;
  setUI: (ui: UIStatePartial) => void;
  loadModels: (opts?: { showErrors?: boolean }) => Promise<void>;
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
  const t = useT();
  const {
    favoriteModelIds = [],
    toggleFavoriteModel,
    setUI,
    loadModels,
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
        <SettingsSection title={t('settings.section.default-model')}>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">
                {nameOf(chosenModelId || defaultModelId)}
              </div>
              <div className="settings-row-label-description">
                {t(chosenModelId ? 'models.default.follows' : 'models.default.startsHere')}
              </div>
            </div>
            <div className="settings-row-control flex gap-2">
              {chosenModelId && (
                <button
                  className="btn-outline btn-sm"
                  onClick={() => setUI({ chatDefaults: { modelId: undefined } })}
                >
                  {t('models.default.reset')}
                </button>
              )}
              <button className="btn-ghost btn-sm" onClick={() => loadModels({ showErrors: true })}>
                {t('models.default.refresh')}
              </button>
            </div>
          </div>
        </SettingsSection>,
      )}

      {renderSection(
        'models',
        'favorites',
        <SettingsSection title={t('settings.section.favorites')}>
          <p className="field__hint -mt-2">{t('models.favorites.hint')}</p>
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
                      title={t('picker.removeFavorite')}
                      aria-label={t('picker.removeFavoriteNamed', { model: nameOf(id) })}
                      onClick={() => toggleFavoriteModel(id)}
                    >
                      <XMarkIcon />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="settings-empty">{t('models.favorites.empty')}</p>
          )}
          <ModelSearch
            ref={modelSearchRef}
            placeholder={t('models.favorites.add')}
            selectedIds={favoriteModelIds}
            clearOnSelect
            onSelect={(result) => {
              if (!favoriteModelIds.includes(result.id)) toggleFavoriteModel(result.id);
            }}
          />
        </SettingsSection>,
      )}

      {renderSection(
        'models',
        'privacy',
        <SettingsSection title={t('settings.section.privacy')}>
          <ToggleSwitch
            checked={zdrOnly === true}
            onChange={(checked) => {
              setZdrOnly(checked);
              void loadModels();
            }}
            label={t('models.zdr')}
            description={t('models.zdrHint')}
          />
        </SettingsSection>,
      )}
    </>
  );
}
