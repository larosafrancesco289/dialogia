import { useChatStore } from '@/lib/store';
import { HeaderDivider } from '@/components/top-header/HeaderDivider';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { useTutorToggle } from '@/modules/tutor/ui/useTutorToggle';
import { PlanStatusBadge } from '@/modules/tutor/components/header/PlanStatusBadge';
import { TutorToggle } from '@/modules/tutor/components/header/TutorToggle';

/**
 * The tutor module's `headerControls` slot: the mode toggle and the plan badge.
 * Reads everything it needs from the store, so the shell mounts it
 * without passing props and knows nothing about learning plans.
 */
export function TutorHeaderSlot() {
  const tutor = useTutorToggle();
  const planGeneration = useChatStore((s) =>
    s.selectedChatId ? s.ui.plan?.generationByChatId?.[s.selectedChatId] : undefined,
  );

  const { learningPlan, hasPlan, planProgress, rightPanelOpen, onToggleRightPanel } =
    usePlanCallbacks();

  return (
    <>
      {tutor.available && (
        <>
          <TutorToggle
            active={tutor.active}
            forceTutorMode={tutor.forced}
            onToggle={tutor.toggle}
          />
          <HeaderDivider />
        </>
      )}

      {tutor.active && hasPlan && (
        <>
          <PlanStatusBadge
            planGeneration={planGeneration}
            hasPlan={hasPlan}
            planProgress={planProgress}
            learningPlan={learningPlan}
            panelOpen={rightPanelOpen}
            onToggleRightPanel={onToggleRightPanel}
          />
          <HeaderDivider />
        </>
      )}
    </>
  );
}
