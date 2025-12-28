import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { ThemeToggle } from '@/components/ThemeToggle';
import { TopHeaderMobileMenu } from '@/components/top-header/MobileMenu';
import { PlanSheet } from '@/components/plan/PlanSheet';
import { PlanStatusBadge } from '@/components/top-header/PlanStatusBadge';
import { TutorToggle } from '@/components/top-header/TutorToggle';
import { ModelPickerControl } from '@/components/top-header/ModelPickerControl';
import type { TopHeaderState } from '@/components/top-header/useTopHeaderState';

export function TopHeaderView({
  chat,
  collapsed,
  isSettingsOpen,
  planSheetOpen,
  planSheetOverride,
  planGeneration,
  tutorActive,
  tutorModelLabel,
  experimentalTutor,
  forceTutorMode,
  hasPlan,
  learningPlan,
  planProgress,
  currentNode,
  learnerModel,
  onToggleSidebar,
  onToggleSettings,
  onOpenSettings,
  onNewChat,
  onRenameChat,
  onToggleTutor,
  onOpenPlanSheet,
  onClosePlanSheet,
  onPlanUpdate,
  onStartLesson,
}: TopHeaderState) {
  const plan = planSheetOverride ?? learningPlan ?? null;

  return (
    <div className="app-header gap-3 flex-wrap sm:flex-nowrap top-header">
      <button
        className="btn btn-ghost shrink-0"
        aria-label="Toggle sidebar"
        onClick={onToggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRightIcon className="h-5 w-5" />
        ) : (
          <ChevronLeftIcon className="h-5 w-5" />
        )}
      </button>

      <div className="order-2 flex-1 min-w-0 w-full sm:w-auto">
        <ModelPickerControl tutorActive={tutorActive} tutorModelLabel={tutorModelLabel} />
      </div>

      <div className="order-3 ml-auto flex items-center gap-2">
        {experimentalTutor && (
          <TutorToggle
            active={tutorActive}
            forceTutorMode={forceTutorMode}
            onToggle={onToggleTutor}
          />
        )}
        <PlanStatusBadge
          planGeneration={planGeneration}
          hasPlan={hasPlan}
          planProgress={planProgress}
          currentNode={currentNode}
          learningPlan={learningPlan}
          onOpenPlanSheet={onOpenPlanSheet}
        />
        <button
          className="btn btn-ghost shrink-0 hide-on-mobile"
          aria-label="New chat"
          title="New chat"
          onClick={onNewChat}
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        <div className="hide-on-mobile">
          <ThemeToggle />
        </div>
        <button
          className="btn btn-ghost hide-on-mobile"
          aria-label="Open settings"
          aria-pressed={isSettingsOpen}
          onClick={onToggleSettings}
          onMouseEnter={() => {
            import('@/components/settings/SettingsDrawer').catch(() => undefined);
          }}
          onFocus={() => {
            import('@/components/settings/SettingsDrawer').catch(() => undefined);
          }}
        >
          <Cog6ToothIcon className="h-5 w-5" />
        </button>
        <TopHeaderMobileMenu
          hasChat={!!chat}
          collapsed={collapsed}
          onNewChat={onNewChat}
          onRenameChat={chat ? onRenameChat : undefined}
          onOpenSettings={onOpenSettings}
          onToggleSidebar={onToggleSidebar}
        />
      </div>

      <PlanSheet
        plan={plan}
        isOpen={planSheetOpen}
        onClose={onClosePlanSheet}
        onUpdate={onPlanUpdate}
        onStartLesson={onStartLesson}
        learnerModel={learnerModel}
      />
    </div>
  );
}
