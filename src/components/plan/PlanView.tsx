'use client';
import { AcademicCapIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import {
  isNodeReady,
  getAllPrerequisites,
  getNextNode,
  calculatePlanProgress,
} from '@/lib/agent/planGenerator';
import { PlanNode } from './PlanNode';
import { ProgressIndicator } from './ProgressIndicator';
import { useMemo } from 'react';

export function PlanView({
  plan,
  onUpdate,
  onNodeStatusChange,
}: {
  plan: LearningPlan;
  onUpdate?: (updatedPlan: LearningPlan) => void;
  onNodeStatusChange?: (nodeId: string, status: 'not_started' | 'in_progress' | 'completed') => void;
}) {
  const nextNode = getNextNode(plan);
  const allCompleted = plan.nodes.every((n) => n.status === 'completed');
  const progress = useMemo(() => calculatePlanProgress(plan), [plan]);
  const totalTopics = plan.nodes.length;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <section className="rounded-2xl border border-border/60 bg-surface px-5 py-6 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider"
                style={{
                  color: 'color-mix(in oklab, var(--color-accent) 75%, var(--color-fg) 25%)',
                  border: '1px solid color-mix(in oklab, var(--color-accent) 40%, var(--color-border))',
                  background: 'color-mix(in oklab, var(--color-accent) 12%, var(--color-surface))',
                }}
              >
                <AcademicCapIcon className="h-4 w-4" />
                Personalized Journey
              </div>
              <h3
                className="text-xl font-semibold leading-tight md:text-2xl"
                style={{ color: 'var(--color-fg)' }}
              >
                {plan.goal}
              </h3>
              <p className="text-sm text-muted-foreground">
                {totalTopics} curated topics with adaptive checkpoints and mastery tracking.
              </p>
            </div>
            <div
              className="flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-xs text-muted-foreground shadow-[var(--shadow-1)]"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-accent) 28%, var(--color-border))',
                background: 'color-mix(in oklab, var(--color-accent) 10%, var(--color-surface))',
              }}
            >
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">
                  Progress
                </span>
                <span className="text-lg font-semibold text-foreground">{progress.percentComplete}%</span>
              </div>
              <div className="hidden h-9 w-px bg-border/70 md:block" />
              <div className="hidden flex-col md:flex">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">
                  Topics
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {progress.completed}/{plan.nodes.length}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-3">
            <div
              className="rounded-xl px-4 py-3 shadow-[var(--shadow-1)]"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-accent) 26%, var(--color-border))',
                background: 'color-mix(in oklab, var(--color-accent) 8%, var(--color-surface))',
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">
                Completed
              </span>
              <div className="mt-1 text-base font-semibold text-foreground">{progress.completed}</div>
            </div>
            <div
              className="rounded-xl px-4 py-3 shadow-[var(--shadow-1)]"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-accent-2) 30%, var(--color-border))',
                background: 'color-mix(in oklab, var(--color-accent-2) 10%, var(--color-surface))',
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">
                In Progress
              </span>
              <div className="mt-1 text-base font-semibold text-foreground">
                {progress.inProgress || 0}
              </div>
            </div>
            <div
              className="rounded-xl px-4 py-3 shadow-[var(--shadow-1)]"
              style={{
                border: '1px solid color-mix(in oklab, var(--color-border) 85%, transparent)',
                background: 'color-mix(in oklab, var(--color-muted) 55%, transparent)',
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/75">
                Remaining
              </span>
              <div className="mt-1 text-base font-semibold text-foreground">
                {progress.notStarted}
              </div>
            </div>
          </div>

          <div
            className="rounded-xl px-4 py-4"
            style={{
              border: '1px solid color-mix(in oklab, var(--color-accent) 24%, var(--color-border))',
              background: 'color-mix(in oklab, var(--color-accent) 8%, var(--color-surface))',
            }}
          >
            <ProgressIndicator plan={plan} />
          </div>
        </div>
      </section>

      {/* Current focus highlight */}
      {nextNode && !allCompleted && (
        <div
          className="rounded-2xl px-5 py-5 shadow-[var(--shadow-1)]"
          style={{
            border: '1px solid color-mix(in oklab, var(--color-accent-2) 35%, var(--color-border))',
            background: 'color-mix(in oklab, var(--color-accent-2) 12%, var(--color-surface))',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="rounded-full p-2.5 shadow-[var(--shadow-1)]"
              style={{ background: 'color-mix(in oklab, var(--color-accent-2) 22%, var(--color-surface))' }}
            >
              <SparklesIcon className="h-5 w-5" style={{ color: 'var(--color-accent-2)' }} />
            </div>
            <div className="min-w-0">
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)' }}
              >
                Current focus
              </p>
              <p className="text-base font-semibold" style={{ color: 'var(--color-fg)' }}>
                {nextNode.name}
              </p>
              {nextNode.description && (
                <p
                  className="mt-1 text-xs"
                  style={{ color: 'color-mix(in oklab, var(--color-accent-2) 60%, var(--color-fg-muted) 40%)' }}
                >
                  {nextNode.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completion message */}
      {allCompleted && (
        <div
          className="rounded-3xl p-4 shadow-[var(--shadow-1)]"
          style={{
            border: '1px solid color-mix(in oklab, var(--color-accent) 35%, var(--color-border))',
            background: 'color-mix(in oklab, var(--color-accent) 12%, var(--color-surface))',
          }}
        >
          <div className="flex items-center gap-3">
            <SparklesIcon className="h-5 w-5" style={{ color: 'var(--color-accent)' }} />
            <p
              className="text-sm font-medium"
              style={{ color: 'color-mix(in oklab, var(--color-accent) 80%, var(--color-fg) 20%)' }}
            >
              🎉 Congratulations! You've completed every topic in this learning plan.
            </p>
          </div>
        </div>
      )}

      {/* Node list */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/80">
            Topics & milestones
          </h4>
          <span
            className="rounded-full px-3 py-1 text-xs text-muted-foreground"
            style={{
              border: '1px solid color-mix(in oklab, var(--color-accent) 26%, var(--color-border))',
              background: 'color-mix(in oklab, var(--color-accent) 10%, var(--color-surface))',
            }}
          >
            {progress.completed}/{plan.nodes.length} complete
          </span>
        </div>
        {plan.nodes.map((node) => {
          const ready = isNodeReady(node.id, plan);
          const prerequisites = getAllPrerequisites(node.id, plan);

          return (
            <PlanNode
              key={node.id}
              node={node}
              isReady={ready}
              prerequisites={prerequisites}
              onStatusChange={
                onNodeStatusChange ? (status) => onNodeStatusChange(node.id, status) : undefined
              }
            />
          );
        })}
      </section>

      {/* Metadata footer */}
      {plan.metadata && (
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {plan.metadata.difficulty && (
              <div>
                <span className="font-medium">Difficulty:</span>{' '}
                <span className="capitalize">{plan.metadata.difficulty}</span>
              </div>
            )}
            {plan.metadata.estimatedHours && (
              <div>
                <span className="font-medium">Est. Time:</span>{' '}
                <span>{plan.metadata.estimatedHours}h</span>
              </div>
            )}
            {plan.metadata.prerequisites && plan.metadata.prerequisites.length > 0 && (
              <div>
                <span className="font-medium">Prerequisites:</span>{' '}
                <span>{plan.metadata.prerequisites.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
