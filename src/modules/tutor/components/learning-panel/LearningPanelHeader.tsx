import { PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { COMPOSER_FIELD_SELECTOR, refocusIfDropped } from '@/lib/ui/focus';
import { useT } from '@/modules/tutor/i18n';

export function LearningPanelHeader({
  revising,
  previewing,
  canRevise,
  onToggleRevise,
  onClose,
}: {
  revising: boolean;
  previewing: boolean;
  canRevise: boolean;
  onToggleRevise: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="learning-panel__header">
      <div className="learning-panel__title-row">
        <span className="learning-panel__title">
          {t(revising ? 'hub.editing' : previewing ? 'hub.proposed' : 'hub.title')}
        </span>
        {/* Always visible while the plan can change: the option to edit is
            worth more than its use, so it must never be hard to find. */}
        {canRevise && (
          <button
            type="button"
            className="learning-panel__revise"
            aria-pressed={revising}
            onClick={onToggleRevise}
          >
            {!revising && <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />}
            {t(revising ? 'hub.done' : 'hub.editPlan')}
          </button>
        )}
        {/* Opened from a proposal's "View full plan", the Hub has no badge
            in the header to close it by, so it carries its own way out. */}
        <button
          type="button"
          className="icon-button learning-panel__close"
          onClick={() => {
            onClose();
            // The button goes with the panel: back to the header's Hub button,
            // or the composer when the Hub was a proposal's preview. Once the
            // panel has slid away, since the button holds focus until then.
            window.setTimeout(
              () =>
                refocusIfDropped(
                  () => document.querySelector('.plan-button'),
                  () => document.querySelector(COMPOSER_FIELD_SELECTOR),
                ),
              400,
            );
          }}
          aria-label={t('hub.close')}
          title={t('common.close')}
        >
          <XMarkIcon className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
