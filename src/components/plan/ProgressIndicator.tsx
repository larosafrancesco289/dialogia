'use client';
import type { LearningPlan } from '@/lib/types';
import { calculatePlanProgress } from '@/lib/learning-plan/service';

export function ProgressIndicator({ plan }: { plan: LearningPlan }) {
  const progress = calculatePlanProgress(plan);

  return (
    <div className="space-y-4">
      {/* Editorial progress bar */}
      <div
        className="h-1.5 w-full"
        style={{ background: 'var(--rule-light)', borderRadius: '2px' }}
      >
        <div
          className="h-full transition-all duration-500 ease-out"
          style={{
            width: `${progress.percentComplete}%`,
            background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-2))',
            borderRadius: '2px',
          }}
        />
      </div>

      {/* Stats in editorial style */}
      <div className="flex justify-between text-xs">
        <div
          className="flex items-center gap-2 px-2.5 py-1"
          style={{
            background: 'var(--marginalia-bg)',
            border: '1px solid var(--rule-light)',
            borderRadius: 'var(--radius-editorial)',
          }}
        >
          <span className="font-bold text-foreground">{progress.completed}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">done</span>
        </div>
        <div
          className="flex items-center gap-2 px-2.5 py-1"
          style={{
            background: 'var(--marginalia-bg)',
            border: '1px solid var(--color-accent-2)',
            borderRadius: 'var(--radius-editorial)',
          }}
        >
          <span className="font-bold text-foreground">{progress.inProgress}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">active</span>
        </div>
        <div
          className="flex items-center gap-2 px-2.5 py-1"
          style={{
            background: 'var(--marginalia-bg)',
            border: '1px solid var(--rule-light)',
            borderRadius: 'var(--radius-editorial)',
          }}
        >
          <span className="font-bold text-foreground">{progress.notStarted}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">left</span>
        </div>
      </div>
    </div>
  );
}
