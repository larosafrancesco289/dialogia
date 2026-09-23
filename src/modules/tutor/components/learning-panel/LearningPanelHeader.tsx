import { PencilSquareIcon } from '@heroicons/react/24/outline';

export function LearningPanelHeader({
  revising,
  canRevise,
  onToggleRevise,
}: {
  revising: boolean;
  canRevise: boolean;
  onToggleRevise: () => void;
}) {
  return (
    <div className="learning-panel__header">
      <div className="learning-panel__title-row">
        <span className="learning-panel__title">
          {revising ? 'Revising the plan' : 'Learning Hub'}
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
            {revising ? 'Done' : 'Revise plan'}
          </button>
        )}
      </div>
    </div>
  );
}
