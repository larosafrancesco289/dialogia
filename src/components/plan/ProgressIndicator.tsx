'use client';
import type { LearningPlan } from '@/lib/types';
import { calculatePlanProgress } from '@/lib/learningPlan/service';

export function ProgressIndicator({ plan }: { plan: LearningPlan }) {
  const progress = calculatePlanProgress(plan);

  return (
    <div className="space-y-4">
      <div className="h-2 rounded-full bg-muted/60">
        <div
          className="h-full rounded-full bg-accent/80 transition-all duration-300 ease-out"
          style={{
            width: `${progress.percentComplete}%`,
          }}
        />
      </div>
      <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
        <div className="space-y-1 text-center">
          <div className="text-lg font-semibold text-foreground">{progress.completed}</div>
          <div className="text-[10px] uppercase tracking-wide leading-tight">Done</div>
        </div>
        <div className="space-y-1 text-center">
          <div className="text-lg font-semibold text-foreground">{progress.inProgress}</div>
          <div className="text-[10px] uppercase tracking-wide leading-tight">Active</div>
        </div>
        <div className="space-y-1 text-center">
          <div className="text-lg font-semibold text-foreground">{progress.notStarted}</div>
          <div className="text-[10px] uppercase tracking-wide leading-tight">Left</div>
        </div>
      </div>
    </div>
  );
}
