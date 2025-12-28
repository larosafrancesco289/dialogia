import {
  ArrowPathIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import type { UiPlanSnapshot } from '@/lib/contracts/ui';

type PlanGeneration = NonNullable<UiPlanSnapshot['generationByChatId']>[string];

type PlanProgress = {
  completed: number;
  percentComplete: number;
};

type PlanNode = Pick<LearningPlan['nodes'][number], 'name'> | null;

export function PlanStatusBadge({
  planGeneration,
  hasPlan,
  planProgress,
  currentNode,
  learningPlan,
  onOpenPlanSheet,
}: {
  planGeneration?: PlanGeneration;
  hasPlan: boolean;
  planProgress: PlanProgress | null;
  currentNode: PlanNode;
  learningPlan?: LearningPlan;
  onOpenPlanSheet: () => void;
}) {
  if (planGeneration?.status === 'loading') {
    return (
      <div
        className="flex min-w-0 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs shadow-[var(--shadow-card)]"
        title={planGeneration.goal || undefined}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
          <ArrowPathIcon className="h-4 w-4 text-primary animate-spin" />
        </span>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-semibold uppercase tracking-wide text-primary">
            Generating plan…
          </span>
          {planGeneration.goal && (
            <span className="truncate text-[11px] text-primary/80">{planGeneration.goal}</span>
          )}
        </div>
      </div>
    );
  }

  if (planGeneration?.status === 'error' && !hasPlan) {
    return (
      <div
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-card)]"
        style={{
          borderColor: 'color-mix(in oklab, var(--color-danger) 40%, var(--color-border))',
          background: 'var(--feedback-incorrect-bg)',
          color: 'var(--feedback-incorrect-text)',
        }}
        title={planGeneration.error || 'Plan generation failed'}
      >
        <ExclamationTriangleIcon className="h-4 w-4" />
        <span>Plan generation failed</span>
      </div>
    );
  }

  if (!hasPlan || !planProgress || !learningPlan) return null;

  return (
    <>
      {currentNode && (
        <div
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs"
          style={{
            background: 'color-mix(in oklab, var(--color-accent-2) 15%, transparent)',
            border: '1px solid color-mix(in oklab, var(--color-accent-2) 35%, var(--color-border))',
          }}
        >
          <SparklesIcon
            className="h-3.5 w-3.5"
            style={{
              color: 'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)',
            }}
          />
          <span
            className="font-medium"
            style={{
              color: 'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)',
            }}
          >
            {currentNode.name}
          </span>
        </div>
      )}
      <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-medium">
          {planProgress.completed}/{learningPlan.nodes.length}
        </span>
        <span>•</span>
        <span>{planProgress.percentComplete}%</span>
      </div>
      <button
        className="btn btn-ghost shrink-0"
        onClick={onOpenPlanSheet}
        title="View Learning Plan"
        aria-label="View Learning Plan"
      >
        <ClipboardDocumentListIcon className="h-5 w-5" />
        <span className="hidden sm:inline ml-1">Plan</span>
      </button>
    </>
  );
}
