'use client';
import { CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import { calculatePlanProgress } from '@/lib/agent/planGenerator';

export function ProgressIndicator({ plan }: { plan: LearningPlan }) {
  const progress = calculatePlanProgress(plan);

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress.percentComplete}%` }}
            />
          </div>
        </div>
        <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {progress.percentComplete}%
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircleIcon className="h-3.5 w-3.5 text-green-500" />
          <span>
            {progress.completed} completed
          </span>
        </div>
        {progress.inProgress > 0 && (
          <div className="flex items-center gap-1.5">
            <ClockIcon className="h-3.5 w-3.5 text-blue-500" />
            <span>
              {progress.inProgress} in progress
            </span>
          </div>
        )}
        {progress.notStarted > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground" />
            <span>
              {progress.notStarted} to go
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
