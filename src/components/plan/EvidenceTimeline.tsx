'use client';
import { useMemo } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  QuestionMarkCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import type { Evidence } from '@/lib/types';

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getEvidenceIcon(type: Evidence['type']) {
  const iconClass = 'h-3.5 w-3.5';
  switch (type) {
    case 'correct_answer':
      return <CheckCircleIcon className={iconClass} />;
    case 'incorrect_answer':
      return <XCircleIcon className={iconClass} />;
    case 'partial_answer':
      return <QuestionMarkCircleIcon className={iconClass} />;
    case 'hint_needed':
      return <LightBulbIcon className={iconClass} />;
    case 'explanation_requested':
      return <AcademicCapIcon className={iconClass} />;
    case 'misconception_detected':
      return <ExclamationTriangleIcon className={iconClass} />;
    case 'insight_demonstrated':
      return <LightBulbIcon className={iconClass} />;
    default:
      return <QuestionMarkCircleIcon className={iconClass} />;
  }
}

function getEvidenceColor(type: Evidence['type']): { bg: string; border: string; text: string } {
  switch (type) {
    case 'correct_answer':
    case 'insight_demonstrated':
      return {
        bg: 'color-mix(in oklab, var(--color-success) 12%, var(--surface-paper))',
        border: 'color-mix(in oklab, var(--color-success) 35%, var(--rule-light))',
        text: 'var(--color-success)',
      };
    case 'incorrect_answer':
    case 'misconception_detected':
      return {
        bg: 'color-mix(in oklab, var(--color-danger) 12%, var(--surface-paper))',
        border: 'color-mix(in oklab, var(--color-danger) 35%, var(--rule-light))',
        text: 'var(--color-danger)',
      };
    case 'partial_answer':
      return {
        bg: 'color-mix(in oklab, var(--color-accent-2) 12%, var(--surface-paper))',
        border: 'color-mix(in oklab, var(--color-accent-2) 35%, var(--rule-light))',
        text: 'var(--color-accent-2)',
      };
    default:
      return {
        bg: 'var(--marginalia-bg)',
        border: 'var(--rule-light)',
        text: 'var(--color-fg-muted)',
      };
  }
}

function getEvidenceLabel(type: Evidence['type']): string {
  switch (type) {
    case 'correct_answer':
      return 'Correct';
    case 'incorrect_answer':
      return 'Incorrect';
    case 'partial_answer':
      return 'Partial';
    case 'hint_needed':
      return 'Hint used';
    case 'explanation_requested':
      return 'Asked for help';
    case 'misconception_detected':
      return 'Misconception';
    case 'insight_demonstrated':
      return 'Insight';
    default:
      return 'Activity';
  }
}

type GroupedEvidence = {
  date: string;
  timestamp: number;
  items: Evidence[];
};

export function EvidenceTimeline({
  evidence,
  maxItems = 10,
  showWeights = true,
}: {
  evidence: Evidence[];
  maxItems?: number;
  showWeights?: boolean;
}) {
  const groupedEvidence = useMemo(() => {
    // Sort by timestamp descending (newest first)
    const sorted = [...evidence].sort((a, b) => b.timestamp - a.timestamp).slice(0, maxItems);

    // Group by date
    const groups: GroupedEvidence[] = [];
    let currentGroup: GroupedEvidence | null = null;

    sorted.forEach((item) => {
      const dateStr = formatDate(item.timestamp);
      if (!currentGroup || currentGroup.date !== dateStr) {
        currentGroup = { date: dateStr, timestamp: item.timestamp, items: [] };
        groups.push(currentGroup);
      }
      currentGroup.items.push(item);
    });

    return groups;
  }, [evidence, maxItems]);

  if (evidence.length === 0) {
    return (
      <div
        className="p-4 text-center text-xs"
        style={{
          background: 'var(--marginalia-bg)',
          border: '1px dashed var(--rule-light)',
          borderRadius: 'var(--radius-editorial)',
          color: 'var(--color-fg-muted)',
        }}
      >
        No learning evidence yet. Start practicing to see your progress here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Evidence Timeline
        </h4>
        <span className="text-[10px] text-muted-foreground">
          {evidence.length} event{evidence.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-4">
        {groupedEvidence.map((group) => (
          <div key={group.date} className="space-y-2">
            {/* Date Header */}
            <div className="flex items-center gap-2">
              <div
                className="px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background: 'var(--marginalia-bg)',
                  border: '1px solid var(--rule-light)',
                  borderRadius: 'var(--radius-editorial)',
                  color: 'var(--color-fg-muted)',
                }}
              >
                {group.date}
              </div>
              <div className="h-px flex-1" style={{ background: 'var(--rule-light)' }} />
            </div>

            {/* Evidence Items */}
            <div className="relative ml-2 space-y-2 pl-4">
              {/* Vertical Line */}
              <div
                className="absolute left-0 top-1 bottom-1 w-px"
                style={{ background: 'var(--rule-light)' }}
              />

              {group.items.map((item, idx) => {
                const colors = getEvidenceColor(item.type);
                const label = getEvidenceLabel(item.type);

                return (
                  <div key={idx} className="relative">
                    {/* Timeline Dot */}
                    <div
                      className="absolute -left-4 top-2 h-2 w-2 -translate-x-1/2 rounded-full"
                      style={{
                        background: colors.text,
                        boxShadow: `0 0 0 2px var(--surface-paper)`,
                      }}
                    />

                    {/* Evidence Card */}
                    <div
                      className="p-2.5"
                      style={{
                        background: colors.bg,
                        border: `1px solid ${colors.border}`,
                        borderRadius: 'var(--radius-editorial)',
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded"
                            style={{
                              background: colors.text,
                              color: '#fff',
                            }}
                          >
                            {getEvidenceIcon(item.type)}
                          </div>
                          <div>
                            <span
                              className="text-xs font-semibold"
                              style={{ color: colors.text }}
                            >
                              {label}
                            </span>
                            <span className="ml-2 text-[10px] text-muted-foreground">
                              {formatRelativeTime(item.timestamp)}
                            </span>
                          </div>
                        </div>

                        {showWeights && item.weight !== 0 && (
                          <span
                            className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                            style={{
                              background:
                                item.weight > 0
                                  ? 'color-mix(in oklab, var(--color-success) 15%, transparent)'
                                  : 'color-mix(in oklab, var(--color-danger) 15%, transparent)',
                              color:
                                item.weight > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                              borderRadius: 'var(--radius-editorial)',
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {item.weight > 0 ? '+' : ''}
                            {Math.round(item.weight * 100)}%
                          </span>
                        )}
                      </div>

                      <p
                        className="mt-1.5 text-xs leading-relaxed"
                        style={{ color: 'var(--color-fg)' }}
                      >
                        {item.details}
                      </p>

                      {item.skill && (
                        <div className="mt-2">
                          <span
                            className="inline-flex px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background: 'var(--marginalia-bg)',
                              border: '1px solid var(--rule-light)',
                              borderRadius: 'var(--radius-editorial)',
                              color: 'var(--color-fg-muted)',
                            }}
                          >
                            {item.skill}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {evidence.length > maxItems && (
        <div className="text-center">
          <span className="text-[10px] text-muted-foreground">
            Showing {maxItems} of {evidence.length} events
          </span>
        </div>
      )}
    </div>
  );
}
