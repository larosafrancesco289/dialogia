import { SettingsSection } from '@/components/settings/SettingsSection';
import { ModelSearch } from '@/components/ModelSearch';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useChatStore } from '@/lib/store';
import { findModelById, formatModelLabel, isDynamicModelId } from '@/lib/models';
import { getModelProviderLabel } from '@/lib/providers';
import type { StoreState } from '@/lib/store/types';
import type { RenderSection } from '@/components/settings/types';
import { useT } from '@/modules/tutor/i18n';

type TutorPanelProps = {
  renderSection: RenderSection;
  experimentalTutor: boolean;
  setUI: (ui: Partial<StoreState['ui']>) => void;
  ui: StoreState['ui'];
  onForceTutorModeChange: (enabled: boolean) => Promise<void>;
  tutorDefaultModel: string;
  setTutorDefaultModel: (value: string) => void;
};

export function TutorPanel(props: TutorPanelProps) {
  const t = useT();
  const {
    renderSection,
    experimentalTutor,
    setUI,
    ui,
    onForceTutorModeChange,
    tutorDefaultModel,
    setTutorDefaultModel,
  } = props;
  const models = useChatStore((s) => s.models);
  // Named as the header's model picker names it, with the provider beneath as
  // the favorites list has it; the raw id only for a model the list lacks.
  const modelMeta = findModelById(models, tutorDefaultModel);
  const modelName = formatModelLabel({ model: modelMeta, fallbackId: tutorDefaultModel });
  const modelDetail = isDynamicModelId(tutorDefaultModel)
    ? t('settings.newest')
    : modelMeta
      ? getModelProviderLabel(modelMeta)
      : tutorDefaultModel;

  return (
    <>
      {renderSection(
        'tutor',
        'tutor',
        <SettingsSection title={t('settings.title')}>
          <ToggleSwitch
            checked={experimentalTutor}
            onChange={(checked) => setUI({ flags: { experimentalTutor: checked } })}
            label={t('settings.offer')}
            description={t('settings.offerHint')}
          />
          {experimentalTutor && (
            <>
              <ToggleSwitch
                checked={!!ui?.tutor?.forceMode}
                onChange={(checked) => {
                  void onForceTutorModeChange(checked);
                }}
                label={t('settings.always')}
                description={t('settings.alwaysHint')}
              />
              <ToggleSwitch
                checked={!!ui?.tutor?.autoScroll}
                onChange={(checked) => setUI({ tutor: { autoScroll: checked } })}
                label={t('settings.follow')}
                description={t('settings.followHint')}
              />
              <div className="field">
                <span className="field__label">{t('settings.model')}</span>
                <div>
                  <span className="settings-list__name">{modelName}</span>
                  <span className="settings-list__meta">{modelDetail}</span>
                </div>
                <ModelSearch
                  placeholder={t('settings.searchModel')}
                  ariaLabel={t('settings.searchModelLabel')}
                  selectedIds={tutorDefaultModel ? [tutorDefaultModel] : []}
                  clearOnSelect
                  onSelect={(result) => setTutorDefaultModel(result.id)}
                />
                <p className="field__hint">{t('settings.modelHint')}</p>
              </div>
              <p className="field__hint">{t('settings.howItWorks')}</p>
            </>
          )}
        </SettingsSection>,
      )}
    </>
  );
}
