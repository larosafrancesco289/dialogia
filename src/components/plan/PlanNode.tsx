'use client';
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
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
        return (
          <CheckCircleSolid
            className="h-5 w-5 flex-shrink-0"
            style={{ color: 'var(--color-accent)' }}
          />
        );
      case 'in_progress':
        return (
          <ClockIcon className="h-5 w-5 flex-shrink-0" style={{ color: 'var(--color-accent-2)' }} />
        );
      case 'not_started':
        if (!isReady) {
          return <LockClosedIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />;
        }
        return (
          <div
            className="h-5 w-5 rounded-full border-2 flex-shrink-0"
            style={{ borderColor: 'color-mix(in oklab, var(--color-accent-2) 35%, var(--color-border))' }}
          />
        );
    }
  };

  const containerStyle = useMemo<CSSProperties>(() => {
    switch (node.status) {
      case 'completed':
        return {
          borderColor: 'color-mix(in oklab, var(--color-accent) 45%, var(--color-border))',
          background: 'color-mix(in oklab, var(--color-accent) 14%, var(--color-surface))',
        };
      case 'in_progress':
        return {
          borderColor: 'color-mix(in oklab, var(--color-accent-2) 45%, var(--color-border))',
          background: 'color-mix(in oklab, var(--color-accent-2) 14%, var(--color-surface))',
        };
      default:
        return isReady
          ? {
              borderColor: 'color-mix(in oklab, var(--color-border) 85%, transparent)',
              background: 'color-mix(in oklab, var(--color-surface) 92%, transparent)',
            }
          : {
              borderColor: 'color-mix(in oklab, var(--color-border) 80%, transparent)',
              background: 'color-mix(in oklab, var(--color-muted) 65%, transparent)',
            };
    }
  }, [node.status, isReady]);

  const canInteract = isReady || node.status !== 'not_started';

  return (
    <div
      className="group relative overflow-hidden rounded-[20px] border shadow-[var(--shadow-card)] transition-transform duration-200 hover:-translate-y-0.5 focus-within:-translate-y-0.5"
      style={containerStyle}
    >
      {/* Node header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="relative flex w-full items-center gap-3 rounded-[inherit] px-4 py-3 text-left transition-colors hover:bg-muted/30"
        disabled={!canInteract}
      >
        {/* Status icon */}
        {getStatusIcon()}

        {/* Node name */}
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{node.name}</div>
          {node.estimatedMinutes && (
            <div className="mt-0.5 text-xs text-muted-foreground">
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
        <div className="space-y-3 border-t border-border/60 bg-muted/30 px-4 pb-4 pt-3">
          {/* Description */}
          {node.description && (
            <div className="pt-3">
              <div className="text-xs text-muted-foreground">{node.description}</div>
            </div>
          )}

          {/* Learning objectives */}
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
              Learning Objectives:
            </div>
            <ul className="space-y-1.5">
              {node.objectives.map((objective, idx) => (
                <li key={idx} className="flex gap-2 text-xs text-foreground">
                  <span
                    className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                  <span className="leading-snug">{objective}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Prerequisites */}
          {prerequisites.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                Prerequisites:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {prerequisites.map((prereq) => (
                  <div
                    key={prereq.id}
                    className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {prereq.status === 'completed' ? (
                      <CheckCircleIcon
                        className="h-3 w-3"
                        style={{ color: 'color-mix(in oklab, var(--color-accent) 80%, var(--color-fg) 20%)' }}
                      />
                    ) : (
                      <ClockIcon
                        className="h-3 w-3"
                        style={{ color: 'color-mix(in oklab, var(--color-accent-2) 70%, var(--color-fg) 30%)' }}
                      />
                    )}
                    <span>{prereq.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status change actions */}
          {onStatusChange && node.status !== 'completed' && (
            <div className="flex gap-2 pt-2">
              {node.status === 'not_started' && (
                <button
                  onClick={() => onStatusChange('in_progress')}
                  className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:opacity-90"
                  style={{
                    background: 'color-mix(in oklab, var(--color-accent-2) 65%, transparent)',
                    color: 'var(--color-surface)',
                  }}
                >
                  Start Learning
                </button>
              )}
              {node.status === 'in_progress' && (
                <>
                  <button
                    onClick={() => onStatusChange('completed')}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:opacity-90"
                    style={{
                      background: 'color-mix(in oklab, var(--color-accent) 70%, transparent)',
                      color: 'var(--color-surface)',
                    }}
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
            <div className="space-y-0.5 pt-2 text-xs text-muted-foreground">
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
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <div className="text-xs italic text-muted-foreground">
            Complete the prerequisites first to unlock this topic.
          </div>
        </div>
      )}
    </div>
  );
}
