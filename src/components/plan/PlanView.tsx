'use client';
import { SparklesIcon } from '@heroicons/react/24/outline';
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
  const metadataChips = useMemo(() => {
    const chips: string[] = [];
    chips.push(`${totalTopics} topics`);
    const estimatedHours = plan.metadata?.estimatedHours;
    if (estimatedHours) chips.push(`~${estimatedHours}h total`);
    const difficulty = plan.metadata?.difficulty;
    if (difficulty)
      chips.push(`${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)} level`);
    return chips;
  }, [plan.metadata?.difficulty, plan.metadata?.estimatedHours, totalTopics]);
  const planUpdatedLabel = useMemo(() => {
    const timestamp = plan.updatedAt || plan.generatedAt;
    if (!timestamp) return null;
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return null;
    }
  }, [plan.updatedAt, plan.generatedAt]);
  const nextPrerequisites = useMemo(
    () => (nextNode ? getAllPrerequisites(nextNode.id, plan) : []),
    [nextNode, plan],
  );
  const pendingPrereqs = useMemo(
    () => nextPrerequisites.filter((prereq) => prereq.status !== 'completed').length,
    [nextPrerequisites],
  );
  const overviewSummary = useMemo(() => {
    const parts: string[] = [];
    const difficulty = plan.metadata?.difficulty;
    if (difficulty) {
      parts.push(`${difficulty.charAt(0).toUpperCase()}${difficulty.slice(1)} pace`);
    }
    const estimatedHours = plan.metadata?.estimatedHours;
    if (estimatedHours) {
      parts.push(`~${estimatedHours}h commitment`);
    }
    const starterTopic =
      nextNode?.name ||
      plan.nodes.find((node) => node.status === 'in_progress')?.name ||
      plan.nodes[0]?.name;
    if (starterTopic) {
      parts.push(`beginning with ${starterTopic.toLowerCase()}`);
    }
    return `Structured across ${totalTopics} topics${parts.length ? ` · ${parts.join(' · ')}` : ''}.`;
  }, [totalTopics, plan.metadata?.difficulty, plan.metadata?.estimatedHours, nextNode, plan.nodes]);
  const readyToStartNext =
    !!nextNode && pendingPrereqs === 0 && nextNode.status === 'not_started' && !!onNodeStatusChange;

  return (
    <div className="space-y-6">
      {/* Overview */}
      <section className="rounded-2xl border border-border/60 bg-surface px-5 py-5 shadow-[var(--shadow-card)]">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            {planUpdatedLabel && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                Updated {planUpdatedLabel}
              </div>
            )}

            <div className="max-w-2xl space-y-2.5">
              <h3 className="text-xl font-semibold leading-tight text-foreground md:text-2xl">
                {plan.goal}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{overviewSummary}</p>
            </div>
            {metadataChips.length > 0 && (
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
                {metadataChips.join(' · ')}
              </div>
            )}
            {nextNode && !allCompleted && (
              <div className="max-w-xl rounded-xl border border-border/60 bg-muted/20 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
                      Up next
                    </div>
                    <div className="text-base font-semibold leading-snug text-foreground">
                      {nextNode.name}
                    </div>
                    {nextNode.description && (
                      <p className="text-xs leading-relaxed text-muted-foreground">{nextNode.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {nextNode.estimatedMinutes && (
                        <span className="badge">~{nextNode.estimatedMinutes} min</span>
                      )}
                      {pendingPrereqs > 0 && <span className="badge">{pendingPrereqs} prereqs left</span>}
                    </div>
                  </div>
                  {readyToStartNext && (
                    <button
                      type="button"
                      onClick={() => onNodeStatusChange?.(nextNode.id, 'in_progress')}
                      className="btn btn-sm btn-primary"
                    >
                      Start topic
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="w-full rounded-2xl border border-border/50 bg-muted/10 px-4 py-4 shadow-[var(--shadow-card)] sm:max-w-sm">
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Overall progress
              </span>
              <span className="text-4xl font-semibold text-foreground">{progress.percentComplete}%</span>
              <span className="text-[11px] text-muted-foreground">
                {progress.completed} of {totalTopics} topics complete
              </span>
            </div>
            <div className="mt-5 rounded-xl border border-border/60 bg-surface px-3 py-3">
              <ProgressIndicator plan={plan} />
            </div>
          </div>
        </div>
      </section>

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
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
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
        <div className="rounded-2xl border border-border/60 bg-muted/20 px-5 py-4">
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
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
