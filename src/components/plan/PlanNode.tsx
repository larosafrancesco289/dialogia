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
  const isLocked = !isReady && node.status === 'not_started';
  const canModifyStatus = !!onStatusChange && node.status !== 'completed' && !isLocked;

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
          borderColor: 'color-mix(in oklab, var(--color-accent) 30%, var(--color-border))',
          background: 'color-mix(in oklab, var(--color-accent) 10%, var(--color-surface))',
        };
      case 'in_progress':
        return {
          borderColor: 'color-mix(in oklab, var(--color-accent-2) 30%, var(--color-border))',
          background: 'color-mix(in oklab, var(--color-accent-2) 10%, var(--color-surface))',
        };
      default:
        return isLocked
          ? {
              borderColor: 'color-mix(in oklab, var(--color-border) 85%, transparent)',
              background: 'color-mix(in oklab, var(--color-muted) 35%, transparent)',
            }
          : {
              borderColor: 'color-mix(in oklab, var(--color-border) 85%, transparent)',
              background: 'color-mix(in oklab, var(--color-surface) 94%, transparent)',
            };
    }
  }, [node.status, isLocked]);

  return (
    <div className="group relative rounded-xl border border-border/60 bg-surface transition-colors" style={containerStyle}>
      {/* Node header */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="relative flex w-full items-center gap-3 rounded-[inherit] px-4 py-3 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[color-mix(in oklab,var(--color-accent)70%,transparent)]"
        aria-expanded={expanded}
      >
        {/* Status icon */}
        {getStatusIcon()}

        {/* Node name */}
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{node.name}</div>
          {isLocked && (
            <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <LockClosedIcon className="h-3 w-3" />
              Locked
            </div>
          )}
          {node.estimatedMinutes && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              ~{node.estimatedMinutes} min
            </div>
          )}
        </div>

        {/* Expand icon */}
        <div>
          {expanded ? (
            <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-3 border-t border-border/60 bg-muted/20 px-4 pb-4 pt-3">
          {isLocked && (
            <div className="flex items-start gap-2 rounded-md border border-dashed border-border/70 bg-transparent px-3 py-2 text-xs text-muted-foreground">
              <LockClosedIcon className="h-4 w-4 flex-shrink-0" />
              <span>Complete the prerequisites first to unlock this topic.</span>
            </div>
          )}

          {/* Description */}
          {node.description && (
            <div className="text-xs text-muted-foreground">{node.description}</div>
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
          {canModifyStatus && (
            <div className="flex gap-2 pt-2">
              {node.status === 'not_started' && (
                <button
                  onClick={() => onStatusChange?.('in_progress')}
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
                    onClick={() => onStatusChange?.('completed')}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors hover:opacity-90"
                    style={{
                      background: 'color-mix(in oklab, var(--color-accent) 70%, transparent)',
                      color: 'var(--color-surface)',
                    }}
                  >
                    Mark Complete
                  </button>
                  <button
                    onClick={() => onStatusChange?.('not_started')}
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
    </div>
  );
}
