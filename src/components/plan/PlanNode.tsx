'use client';
import { useEffect, useState } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  ChevronDownIcon,
  LockClosedIcon,
  PlayIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid';
import type { LearningPlanNode, TopicMastery } from '@/lib/types';
import type { LearnerModelFeedback } from '@/lib/agent/learnerModel';

export function PlanNode({
  node,
  isReady,
  prerequisites,
  onStatusChange,
  onStartLesson,
  mastery,
  isLast,
  focused,
  onAdjust,
}: {
  node: LearningPlanNode;
  isReady: boolean;
  prerequisites: LearningPlanNode[];
  onStatusChange?: (status: 'not_started' | 'in_progress' | 'completed') => void;
  onStartLesson?: (nodeId: string) => void;
  mastery?: TopicMastery;
  isLast?: boolean;
  focused?: boolean;
  onAdjust?: (feedback: LearnerModelFeedback) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (focused) setExpanded(true);
  }, [focused]);
  const isLocked = !isReady && node.status === 'not_started';
  const canModifyStatus = !!onStatusChange && node.status !== 'completed' && !isLocked;

  const statusColor =
    node.status === 'completed'
      ? 'var(--color-accent)'
      : node.status === 'in_progress'
        ? 'var(--color-accent-2)'
        : 'var(--color-muted)';

  const confidence = mastery ? Math.round((mastery.confidence ?? 0) * 100) : undefined;
  const unresolved = mastery?.misconceptions?.filter((m) => !m.resolved) ?? [];
  const lastEvidence = mastery?.evidence?.[mastery.evidence.length - 1];
  const barColor =
    (confidence ?? 0) >= 70
      ? 'color-mix(in oklab, var(--color-accent) 75%, transparent)'
      : (confidence ?? 0) >= 40
        ? 'color-mix(in oklab, var(--color-accent-2) 70%, transparent)'
        : 'color-mix(in oklab, var(--color-danger) 70%, transparent)';

  return (
    <div className="relative flex gap-4">
      {/* Timeline Column */}
      <div className="flex flex-col items-center">
        {/* Node Dot - editorial style */}
        <div
          className="z-10 flex h-7 w-7 items-center justify-center border transition-colors duration-300"
          style={{
            background: 'var(--surface-paper)',
            borderColor: statusColor,
            color: statusColor,
            borderRadius: 'var(--radius-editorial)',
            boxShadow: node.status === 'in_progress' ? '0 0 0 3px var(--marginalia-bg)' : undefined,
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

      {/* Content Card - editorial style */}
      <div className="flex-1 pb-8">
        <div
          className="group relative overflow-hidden transition-all duration-300"
          style={{
            background: 'var(--surface-paper)',
            border: node.status === 'in_progress' ? '1px solid var(--rule-accent)' : '1px solid var(--rule-light)',
            borderLeft: node.status === 'in_progress' ? '2px solid var(--color-accent-2)' : '2px solid var(--rule-light)',
            borderRadius: 'var(--radius-editorial)',
            boxShadow: focused ? '0 0 0 2px var(--focus-ring)' : undefined,
          }}
        >
          {/* Progress Bar (Top) */}
          {mastery && (
            <div className="absolute left-0 top-0 h-1 w-full bg-muted/20">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${confidence ?? 0}%`,
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
                <span
                  className={`font-semibold ${node.status === 'completed' ? 'text-muted-foreground line-through decoration-border' : 'text-foreground'}`}
                >
                  {node.name}
                </span>
                {confidence && confidence > 80 && (
                  <SparklesIcon className="h-3.5 w-3.5 text-amber-500" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {node.estimatedMinutes && <span>~{node.estimatedMinutes} min</span>}
                {node.objectives.length > 0 && <span>· {node.objectives.length} objectives</span>}
              </div>
            </div>

            {/* Primary Action (Start/Continue) - editorial style */}
            {isReady && node.status !== 'completed' && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  if (onStartLesson) onStartLesson(node.id);
                  else onStatusChange?.('in_progress');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-transform active:scale-95 cursor-pointer"
                style={{
                  background: node.status === 'in_progress' ? 'var(--marginalia-bg)' : 'var(--color-accent)',
                  color: node.status === 'in_progress' ? 'var(--color-accent-2)' : '#0b0b0b',
                  border: node.status === 'in_progress' ? '1px solid var(--rule-light)' : 'none',
                  borderRadius: 'var(--radius-editorial)',
                }}
              >
                <PlayIcon className="h-3 w-3" />
                {node.status === 'in_progress' ? 'Continue' : 'Start'}
              </div>
            )}

            <div className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
            </div>
          </button>

          {/* Expanded Details - editorial style */}
          {expanded && (
            <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid var(--rule-light)', background: 'var(--marginalia-bg)' }}>
              {isLocked && (
                <div
                  className="mb-3 flex items-start gap-2 p-2 text-xs text-muted-foreground"
                  style={{ border: '1px dashed var(--rule-light)', borderRadius: 'var(--radius-editorial)' }}
                >
                  <LockClosedIcon className="h-4 w-4 flex-shrink-0" />
                  <span>Complete the prerequisites first to unlock this topic.</span>
                </div>
              )}

              {node.description && (
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  {node.description}
                </p>
              )}

              {mastery && (
                <div
                  className="mb-3 p-3"
                  style={{
                    background: 'var(--surface-paper)',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                        Mastery & evidence
                      </div>
                      <div className="text-sm font-semibold text-foreground">
                        {confidence ?? 0}% confidence
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {mastery.interactions} interaction{mastery.interactions === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="mt-2 h-1 w-full" style={{ background: 'var(--rule-light)', borderRadius: '2px' }}>
                    <div
                      className="h-full transition-all"
                      style={{ width: `${confidence ?? 0}%`, background: barColor, borderRadius: '2px' }}
                    />
                  </div>
                  {unresolved.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-amber-600">
                      {unresolved.map((m) => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 font-medium"
                        >
                          <LockClosedIcon className="h-3 w-3" />
                          {m.description}
                        </span>
                      ))}
                    </div>
                  )}
                  {lastEvidence && (
                    <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">Recent evidence:</span>{' '}
                      {lastEvidence.details}
                    </div>
                  )}
                  {onAdjust && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdjust({
                            nodeId: node.id,
                            direction: 'up',
                            reason: 'Learner marked this as easier than expected.',
                          });
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:text-[var(--color-accent)]"
                        style={{ border: '1px solid var(--rule-light)', borderRadius: 'var(--radius-editorial)' }}
                      >
                        Feels easier
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdjust({
                            nodeId: node.id,
                            direction: 'down',
                            reason: 'Learner marked this as harder than expected.',
                          });
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:text-[var(--color-accent)]"
                        style={{ border: '1px solid var(--rule-light)', borderRadius: 'var(--radius-editorial)' }}
                      >
                        Feels harder
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAdjust({
                            nodeId: node.id,
                            confidenceFloor: Math.max(0.7, mastery.confidence ?? 0),
                            reason: 'Learner is confident and wants a higher floor.',
                          });
                        }}
                        className="px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:text-[var(--color-accent)]"
                        style={{ border: '1px solid var(--rule-light)', borderRadius: 'var(--radius-editorial)' }}
                      >
                        Set 70% floor
                      </button>
                      {unresolved[0] && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAdjust({
                              nodeId: node.id,
                              misconceptionId: unresolved[0].id,
                              misconceptionDescription: unresolved[0].description,
                              reason: 'Misconception resolved by learner',
                              direction: 'up',
                            });
                          }}
                          className="px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:text-[var(--color-accent)]"
                          style={{ border: '1px solid var(--rule-light)', borderRadius: 'var(--radius-editorial)' }}
                        >
                          Resolve misconception
                        </button>
                      )}
                    </div>
                  )}
                </div>
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
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          border: p.status === 'completed' ? '1px solid var(--color-success)' : '1px solid var(--rule-light)',
                          background: p.status === 'completed' ? 'color-mix(in oklab, var(--color-success) 10%, var(--surface-paper))' : 'var(--surface-paper)',
                          color: p.status === 'completed' ? 'var(--color-success)' : 'var(--color-fg-muted)',
                          borderRadius: 'var(--radius-editorial)',
                        }}
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
                      className="text-[10px] font-medium hover:underline"
                      style={{ color: 'var(--color-success)' }}
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
