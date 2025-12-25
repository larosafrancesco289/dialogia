'use client';
import { SparklesIcon, PlayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { LearningPlan, LearnerModel, LearningPlanNode } from '@/lib/types';
import { isNodeReady, getAllPrerequisites, getNextNode } from '@/lib/learningPlan/service';
import { PlanNode } from './PlanNode';
import { useMemo } from 'react';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';
import { LearnerStats, LearnerInsights } from './LearnerModelView';

export function PlanView({
  plan,
  onNodeStatusChange,
  onStartLesson,
  learnerModel,
  focusNodeId,
  onLearnerModelFeedback,
  latestUpdateSummary,
}: {
  plan: LearningPlan;
  onNodeStatusChange?: (
    nodeId: string,
    status: 'not_started' | 'in_progress' | 'completed',
  ) => void;
  onStartLesson?: (nodeId: string) => void;
  learnerModel?: LearnerModel;
  focusNodeId?: string;
  onLearnerModelFeedback?: (feedback: LearnerModelFeedback) => void;
  latestUpdateSummary?: string;
}) {
  const nextNode = getNextNode(plan);
  const allCompleted = plan.nodes.every((n) => n.status === 'completed');
  const phases = useMemo(() => {
    const groups: { name: string; nodes: LearningPlanNode[] }[] = [];
    let currentGroup: { name: string; nodes: LearningPlanNode[] } | null = null;
    let fallbackGroup: { name: string; nodes: LearningPlanNode[] } | null = null;

    plan.nodes.forEach((node) => {
      const match = node.name.match(/^(Phase|Module|Part|Section)\s+(\d+|[A-Za-z]+):?\s*(.*)/i);
      if (match) {
        const phaseName = `${match[1]} ${match[2]}`;
        if (!currentGroup || currentGroup.name !== phaseName) {
          if (currentGroup) groups.push(currentGroup);
          currentGroup = { name: phaseName, nodes: [] };
        }
        currentGroup.nodes.push(node);
      } else {
        if (currentGroup) {
          currentGroup.nodes.push(node);
        } else {
          if (!fallbackGroup) fallbackGroup = { name: 'Topics', nodes: [] };
          fallbackGroup.nodes.push(node);
        }
      }
    });

    if (currentGroup) groups.push(currentGroup);
    if (fallbackGroup) {
      if (groups.length === 0) {
        groups.push(fallbackGroup);
      } else {
        groups.unshift(fallbackGroup);
      }
    }

    if (groups.length === 1 && groups[0].name === 'Topics') {
      groups[0].name = 'Your Journey';
    }

    return groups;
  }, [plan.nodes]);

  const getMastery = (nodeId: string) => {
    if (!learnerModel) return undefined;
    return learnerModel.mastery[nodeId];
  };

  // Metadata badges - editorial style
  const metadataBadges = [
    plan.metadata?.difficulty && {
      label: plan.metadata.difficulty,
      style: {
        background: 'var(--marginalia-bg)',
        color: 'var(--color-accent)',
        border: '1px solid var(--rule-accent)',
      },
    },
    plan.metadata?.estimatedHours && {
      label: `~${plan.metadata.estimatedHours}h`,
      style: {
        background: 'var(--marginalia-bg)',
        color: 'var(--color-accent-2)',
        border: '1px solid var(--rule-light)',
      },
    },
    {
      label: `${plan.nodes.length} topics`,
      style: {
        background: 'var(--marginalia-bg)',
        color: 'var(--color-fg-muted)',
        border: '1px solid var(--rule-light)',
      },
    },
  ].filter(Boolean) as { label: string; style: React.CSSProperties }[];

  return (
    <div className="space-y-6 max-w-full">
      {/* Top: Learner Stats */}
      <section className="w-full">
        <LearnerStats learnerModel={learnerModel} plan={plan} />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Timeline (Main) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-8">
          {/* Header info */}
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {metadataBadges.map((badge, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ ...badge.style, borderRadius: 'var(--radius-editorial)' }}
                >
                  {badge.label}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{plan.goal}</p>
          </div>

          {/* Phases List */}
          <div className="space-y-8 pl-2">
            {phases.map((phase, groupIdx) => (
              <section key={groupIdx} className="relative">
                {phases.length > 1 && (
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className="flex h-6 w-6 items-center justify-center font-mono text-[10px] font-bold text-muted-foreground"
                      style={{
                        background: 'var(--marginalia-bg)',
                        border: '1px solid var(--rule-light)',
                        borderRadius: 'var(--radius-editorial)',
                      }}
                    >
                      {groupIdx + 1}
                    </div>
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
                      {phase.name}
                    </h4>
                    <div className="h-px flex-1" style={{ background: 'var(--rule-light)' }} />
                  </div>
                )}

                <div
                  className={`space-y-0 ${phases.length > 1 ? 'ml-3 border-l border-dashed border-border/40 pl-5' : ''}`}
                >
                  {phase.nodes.map((node, idx) => {
                    const ready = isNodeReady(node.id, plan);
                    const prerequisites = getAllPrerequisites(node.id, plan);
                    const isLast = idx === phase.nodes.length - 1 && groupIdx === phases.length - 1;

                    return (
                      <PlanNode
                        key={node.id}
                        node={node}
                        isReady={ready}
                        prerequisites={prerequisites}
                        onStatusChange={
                          onNodeStatusChange
                            ? (status) => onNodeStatusChange(node.id, status)
                            : undefined
                        }
                        onStartLesson={onStartLesson}
                        mastery={getMastery(node.id)}
                        isLast={isLast}
                        focused={focusNodeId === node.id}
                        onAdjust={onLearnerModelFeedback}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* RIGHT COLUMN: Sidebar (Next Up, Insights) */}
        <aside className="lg:col-span-5 xl:col-span-4 space-y-6 sticky top-4">
          {/* Next Up Card - editorial marginalia style */}
          {nextNode && !allCompleted && (
            <div
              className="marginalia p-4"
              style={{ borderLeftColor: 'var(--color-accent)' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
                  <SparklesIcon className="h-3 w-3" />
                  Up Next
                </span>
              </div>

              <h3 className="text-sm font-semibold text-foreground mb-1" style={{ fontFamily: 'var(--font-serif-assistant)' }}>{nextNode.name}</h3>
              {nextNode.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {nextNode.description}
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  if (onStartLesson) onStartLesson(nextNode.id);
                  else onNodeStatusChange?.(nextNode.id, 'in_progress');
                }}
                className="btn w-full inline-flex justify-center items-center gap-2 px-3 py-1.5 text-xs font-semibold"
              >
                <PlayIcon className="h-3 w-3" />
                {nextNode.status === 'in_progress' ? 'Continue Lesson' : 'Start Lesson'}
              </button>
            </div>
          )}

          {/* Completion Card - editorial style */}
          {allCompleted && (
            <div
              className="marginalia p-5 text-center"
              style={{ borderLeftColor: 'var(--color-success)' }}
            >
              <CheckCircleIcon className="h-8 w-8 mx-auto mb-2" style={{ color: 'var(--color-success)' }} />
              <h3 className="font-semibold text-foreground" style={{ fontFamily: 'var(--font-serif-assistant)' }}>Journey Complete!</h3>
            </div>
          )}

          {/* Latest Update Summary - editorial style */}
          {latestUpdateSummary && (
            <div className="marginalia p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Latest Agent Update
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed">{latestUpdateSummary}</p>
            </div>
          )}

          {/* Insights Panel */}
          <LearnerInsights learnerModel={learnerModel} plan={plan} />
        </aside>
      </div>
    </div>
  );
}
