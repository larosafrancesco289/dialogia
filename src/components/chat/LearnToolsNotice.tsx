import { rememberSettingsTab } from '@/components/settings/sections/config';
import type { TabId } from '@/components/settings/types';
import { useTutorModel } from '@/lib/hooks/useTutorModel';
import { useChatStore } from '@/lib/store';
import { endpointCapabilities } from '@/lib/transport/endpoints';
import { useT } from '@/lib/i18n';

// Component: LearnToolsNotice
// Responsibility: Say so in Learn when the tutor's model cannot use tools. A
// turn sends such a model no tools, so the tutor can neither plan nor quiz,
// and Learn would quietly be a plain chat.

export function LearnToolsNotice() {
  const t = useT();
  const setUI = useChatStore((s) => s.setUI);
  const model = useTutorModel();
  if (model.canUseTools) return null;
  // The person's own server may well take tools, once it is told it does.
  const toolsOff =
    model.endpoint?.kind === 'openai-compatible' && !endpointCapabilities(model.endpoint).tools;
  const open = (tab: TabId) => {
    rememberSettingsTab(tab);
    setUI({ showSettings: true });
  };
  return (
    <div className="composer-notice" role="status">
      <p>{t('learnTools.notice', { model: model.label })}</p>
      <div className="composer-notice__actions">
        <button type="button" className="btn btn-sm" onClick={() => open('tutor')}>
          {t('learnTools.chooseModel')}
        </button>
        {toolsOff && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => open('connections')}>
            {t('learnTools.turnOnTools')}
          </button>
        )}
      </div>
    </div>
  );
}
