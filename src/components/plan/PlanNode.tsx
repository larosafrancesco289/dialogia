'use client';
import { useState } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import type { LearningPlanNode } from '@/lib/types';

export function PlanNode({
  node,
  isReady,
  prerequisites,
  onStatusChange,
}: {
  node: LearningPlanNode;
  isReady: boolean;
  prerequisites: LearningPlanNode[];
  onStatusChange?: (status: 'not_started' | 'in_progress' | 'completed') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Determine status icon and styling
  const getStatusIcon = () => {
    switch (node.status) {
      case 'completed':
        return <CheckCircleSolid className="h-5 w-5 text-green-500 flex-shrink-0" />;
      case 'in_progress':
        return <ClockIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />;
      case 'not_started':
        if (!isReady) {
          return <LockClosedIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />;
        }
        return (
          <div className="h-5 w-5 rounded-full border-2 border-muted-foreground flex-shrink-0" />
        );
    }
  };

  const getStatusColor = () => {
    switch (node.status) {
      case 'completed':
        return 'border-green-500/20 bg-green-500/5';
      case 'in_progress':
        return 'border-blue-500/20 bg-blue-500/5';
      case 'not_started':
        return isReady ? 'border-border bg-background' : 'border-border bg-muted/20';
    }
  };

  const canInteract = isReady || node.status !== 'not_started';

  return (
    <div className={`rounded-lg border ${getStatusColor()} overflow-hidden`}>
      {/* Node header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left hover:bg-muted/20 transition-colors"
        disabled={!canInteract}
      >
        {/* Status icon */}
        {getStatusIcon()}

        {/* Node name */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{node.name}</div>
          {node.estimatedMinutes && (
            <div className="text-xs text-muted-foreground mt-0.5">
              ~{node.estimatedMinutes} min
            </div>
          )}
        </div>

        {/* Expand icon */}
        {canInteract && (
          <div>
            {expanded ? (
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        )}
      </button>

      {/* Expanded content */}
      {expanded && canInteract && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/50">
          {/* Description */}
          {node.description && (
            <div className="pt-3">
              <div className="text-xs text-muted-foreground">{node.description}</div>
            </div>
          )}

          {/* Learning objectives */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1.5">
              Learning Objectives:
            </div>
            <ul className="space-y-1">
              {node.objectives.map((objective, idx) => (
                <li key={idx} className="text-xs text-foreground flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Prerequisites */}
          {prerequisites.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">
                Prerequisites:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {prerequisites.map((prereq) => (
                  <div
                    key={prereq.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs"
                  >
                    {prereq.status === 'completed' ? (
                      <CheckCircleIcon className="h-3 w-3 text-green-500" />
                    ) : (
                      <ClockIcon className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span>{prereq.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status change actions */}
          {onStatusChange && node.status !== 'completed' && (
            <div className="pt-2 flex gap-2">
              {node.status === 'not_started' && (
                <button
                  onClick={() => onStatusChange('in_progress')}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Start Learning
                </button>
              )}
              {node.status === 'in_progress' && (
                <>
                  <button
                    onClick={() => onStatusChange('completed')}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    Mark Complete
                  </button>
                  <button
                    onClick={() => onStatusChange('not_started')}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          )}

          {/* Timestamps */}
          {(node.startedAt || node.completedAt) && (
            <div className="pt-2 text-xs text-muted-foreground space-y-0.5">
              {node.startedAt && (
                <div>Started: {new Date(node.startedAt).toLocaleDateString()}</div>
              )}
              {node.completedAt && (
                <div>Completed: {new Date(node.completedAt).toLocaleDateString()}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Locked message */}
      {expanded && !canInteract && (
        <div className="px-3 pb-3 pt-3 border-t border-border/50">
          <div className="text-xs text-muted-foreground italic">
            Complete the prerequisites first to unlock this topic.
          </div>
        </div>
      )}
    </div>
  );
}
