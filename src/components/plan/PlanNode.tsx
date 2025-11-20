'use client';
import { useState } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  LockClosedIcon,
  PlayIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import type { LearningPlanNode } from '@/lib/types';

export function PlanNode({
  node,
  isReady,
  prerequisites,
  onStatusChange,
  onStartLesson,
  mastery,
  isLast,
}: {
  node: LearningPlanNode;
  isReady: boolean;
  prerequisites: LearningPlanNode[];
  onStatusChange?: (status: 'not_started' | 'in_progress' | 'completed') => void;
  onStartLesson?: (nodeId: string) => void;
  mastery?: { confidence: number };
  isLast?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLocked = !isReady && node.status === 'not_started';
  const canModifyStatus = !!onStatusChange && node.status !== 'completed' && !isLocked;

  const statusColor =
    node.status === 'completed'
      ? 'var(--color-accent)'
      : node.status === 'in_progress'
        ? 'var(--color-accent-2)'
        : 'var(--color-muted)';

  return (
    <div className="relative flex gap-4">
      {/* Timeline Column */}
      <div className="flex flex-col items-center">
        {/* Node Dot */}
        <div
          className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-surface transition-colors duration-300 ${
            node.status === 'in_progress' ? 'ring-4 ring-[color-mix(in_oklab,var(--color-accent-2)_20%,transparent)]' : ''
          }`}
          style={{
            borderColor: statusColor,
            color: statusColor,
          }}
        >
          {node.status === 'completed' ? (
            <CheckCircleSolid className="h-5 w-5" />
          ) : node.status === 'in_progress' ? (
            <ClockIcon className="h-5 w-5" />
          ) : isLocked ? (
            <LockClosedIcon className="h-4 w-4 text-muted-foreground" />
          ) : (
            <div className="h-2.5 w-2.5 rounded-full bg-current opacity-40" />
          )}
        </div>

        {/* Connecting Line */}
        {!isLast && (
          <div
            className="w-0.5 flex-1 transition-colors duration-300"
            style={{
              background: `linear-gradient(to bottom, ${statusColor} 0%, var(--color-border) 80%)`,
              opacity: 0.5,
            }}
          />
        )}
      </div>

      {/* Content Card */}
      <div className="flex-1 pb-8">
        <div
          className={`group relative overflow-hidden rounded-xl border bg-surface transition-all duration-300 ${
            node.status === 'in_progress'
              ? 'border-[color-mix(in_oklab,var(--color-accent-2)_40%,var(--color-border))] shadow-md'
              : 'border-border/60 hover:border-border hover:shadow-sm'
          }`}
        >
          {/* Progress Bar (Top) */}
          {mastery && (
            <div className="absolute left-0 top-0 h-1 w-full bg-muted/20">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.round(mastery.confidence * 100)}%`,
                  background: `linear-gradient(90deg, var(--color-accent), var(--color-accent-2))`,
                }}
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none"
          >
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className={`font-semibold ${node.status === 'completed' ? 'text-muted-foreground line-through decoration-border' : 'text-foreground'}`}>
                  {node.name}
                </span>
                {mastery && mastery.confidence > 0.8 && (
                  <SparklesIcon className="h-3.5 w-3.5 text-amber-500" />
                )}
              </div>
              
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {node.estimatedMinutes && (
                  <span>~{node.estimatedMinutes} min</span>
                )}
                {node.objectives.length > 0 && (
                  <span>· {node.objectives.length} objectives</span>
                )}
              </div>
            </div>

            {/* Primary Action (Start/Continue) */}
            {isReady && node.status !== 'completed' && (
               <div
                 onClick={(e) => {
                   e.stopPropagation();
                   if (onStartLesson) onStartLesson(node.id);
                   else onStatusChange?.('in_progress');
                 }}
                 className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-transform active:scale-95 cursor-pointer ${
                   node.status === 'in_progress'
                    ? 'bg-[color-mix(in_oklab,var(--color-accent-2)_15%,var(--color-surface))] text-[var(--color-accent-2)] hover:bg-[color-mix(in_oklab,var(--color-accent-2)_25%,var(--color-surface))]'
                    : 'bg-primary text-primary-foreground hover:brightness-110 shadow-sm'
                 }`}
               >
                 <PlayIcon className="h-3 w-3" />
                 {node.status === 'in_progress' ? 'Continue' : 'Start'}
               </div>
            )}

            <div className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>

          {/* Expanded Details */}
          {expanded && (
            <div className="border-t border-border/50 bg-muted/20 px-4 pb-4 pt-3">
              {isLocked && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-dashed border-border/70 p-2 text-xs text-muted-foreground">
                  <LockClosedIcon className="h-4 w-4 flex-shrink-0" />
                  <span>Complete the prerequisites first to unlock this topic.</span>
                </div>
              )}

              {node.description && (
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  {node.description}
                </p>
              )}

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                  Objectives
                </div>
                <ul className="space-y-1.5">
                  {node.objectives.map((obj, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground/90">
                      <div className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <span className="leading-snug">{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {prerequisites.length > 0 && (
                <div className="mt-3">
                   <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                    Prerequisites
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {prerequisites.map((p) => (
                      <span
                        key={p.id}
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                          p.status === 'completed' 
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' 
                            : 'border-border bg-surface text-muted-foreground'
                        }`}
                      >
                        {p.status === 'completed' && <CheckCircleIcon className="h-3 w-3" />}
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Controls */}
              {canModifyStatus && (
                <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
                  {node.status === 'in_progress' && (
                    <button
                      onClick={() => onStatusChange?.('completed')}
                      className="text-[10px] font-medium text-emerald-600 hover:underline"
                    >
                      Mark as Complete
                    </button>
                  )}
                  {node.status !== 'not_started' && (
                    <button
                      onClick={() => onStatusChange?.('not_started')}
                      className="text-[10px] font-medium text-muted-foreground hover:underline"
                    >
                      Reset Status
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
