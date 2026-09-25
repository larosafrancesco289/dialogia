import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { selectCurrentChat } from '@/lib/store/selectors';
import { findModelById, formatModelLabel } from '@/lib/models';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';

/**
 * The tutor module's `phoneHeaderLine` slot: the line under the chat's title
 * while a session is on, where a normal chat has its model. It says how far
 * the plan has come and opens the Learning Hub, as the model line opens the
 * model picker.
 */
export function TutorHeaderLine() {
  const { models, modelId } = useChatStore((s) => {
    const chat = selectCurrentChat(s);
    return {
      models: s.models,
      modelId:
        chat?.settings?.features.tutor?.defaultModelId ||
        chat?.settings?.modelId ||
        s.ui.tutor?.defaultModelId,
    };
  }, shallow);
  const { learningPlan, hasPlan, planProgress, onOpenRightPanel, rightPanelOpen } =
    usePlanCallbacks();

  const modelLabel = useMemo(
    () =>
      modelId
        ? formatModelLabel({ model: findModelById(models, modelId), fallbackId: modelId })
        : '',
    [models, modelId],
  );

  const canOpen = hasPlan && !!planProgress && !!learningPlan;
  const detail = canOpen
    ? `${planProgress.completed} of ${learningPlan.nodes.length} topics`
    : modelLabel;

  return (
    <button
      type="button"
      className="tutor-header-line"
      onClick={canOpen ? () => onOpenRightPanel() : undefined}
      disabled={!canOpen}
      aria-label={canOpen ? `Learning Hub: ${detail}` : undefined}
      aria-haspopup={canOpen ? 'dialog' : undefined}
      aria-expanded={canOpen ? rightPanelOpen : undefined}
    >
      <span className="tutor-header-line__label">Tutor</span>
      {/* The session is live, so its dot is gold, as on desktop. */}
      <span className="tutor-header-line__live" aria-hidden="true" />
      {detail && <span className="tutor-header-line__detail">{detail}</span>}
      {canOpen && <ChevronDownIcon className="tutor-header-line__chevron" aria-hidden="true" />}
    </button>
  );
}
