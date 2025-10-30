'use client';
import { AcademicCapIcon, SparklesIcon } from '@heroicons/react/24/outline';
import type { LearningPlan } from '@/lib/types';
import { isNodeReady, getAllPrerequisites, getNextNode } from '@/lib/agent/planGenerator';
import { PlanNode } from './PlanNode';
import { ProgressIndicator } from './ProgressIndicator';

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

  return (
    <div className="rounded-lg border border-border bg-muted/40">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <AcademicCapIcon className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-base">Learning Plan</h3>
        </div>
        <div className="text-sm text-muted-foreground mb-3">{plan.goal}</div>
        <ProgressIndicator plan={plan} />
      </div>

      {/* Current focus highlight */}
      {nextNode && !allCompleted && (
        <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20">
          <div className="flex items-center gap-2 text-sm">
            <SparklesIcon className="h-4 w-4 text-blue-500" />
            <span className="text-blue-700 dark:text-blue-400 font-medium">
              Current Focus: {nextNode.name}
            </span>
          </div>
        </div>
      )}

      {/* Completion message */}
      {allCompleted && (
        <div className="px-4 py-3 bg-green-500/10 border-b border-green-500/20">
          <div className="flex items-center gap-2 text-sm">
            <SparklesIcon className="h-4 w-4 text-green-500" />
            <span className="text-green-700 dark:text-green-400 font-medium">
              🎉 Congratulations! You've completed all topics in this learning plan.
            </span>
          </div>
        </div>
      )}

      {/* Node list */}
      <div className="p-4 space-y-3">
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
      </div>

      {/* Metadata footer */}
      {plan.metadata && (
        <div className="px-4 py-2 border-t border-border bg-muted/20">
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
