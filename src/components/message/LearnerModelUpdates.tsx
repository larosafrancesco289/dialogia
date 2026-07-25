'use client';
import {
  CheckCircleIcon,
  ArrowTrendingUpIcon,
  ChevronDownIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { Message, TopicMastery } from '@/lib/types';
import { useState } from 'react';
import { useChatStore } from '@/lib/store';

export function LearnerModelUpdates({ message }: { message: Message }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const setUI = useChatStore((s) => s.setUI);
  const handleToggleDetails = () => setIsExpanded((prev) => !prev);

  const { planUpdates, learnerModel } = message;
  const masteryEntries: Array<[string, TopicMastery]> = learnerModel
    ? (Object.entries(learnerModel.mastery ?? {}) as Array<[string, TopicMastery]>)
    : [];
  const hasSummary = !!planUpdates?.summary;

  // Only show if there are updates or learner model data
  if (!planUpdates && !learnerModel) return null;

  const hasStatusChanges = planUpdates?.statusChanges && planUpdates.statusChanges.length > 0;
  const hasMasteryChanges = planUpdates?.masteryChanges && planUpdates.masteryChanges.length > 0;
  const hasAnyUpdates = hasStatusChanges || hasMasteryChanges || hasSummary;

  if (!hasAnyUpdates && !learnerModel) return null;

  return (
    <div className="px-4 pb-3">
      <div
        className="rounded-lg border"
        style={{
          borderColor: 'color-mix(in oklab, var(--color-accent-2) 35%, var(--color-border))',
          background: 'color-mix(in oklab, var(--color-accent-2) 8%, var(--color-surface))',
        }}
      >
        {hasSummary && (
          <div className="border-b border-border/60 px-3 py-2 text-sm font-medium text-foreground flex items-center justify-between">
            <span>{planUpdates?.summary}</span>
            <button
              className="text-xs text-accent hover:underline flex items-center gap-1"
              onClick={() => setUI({ plan: { rightPanelOpen: true, rightPanelTab: 'progress' } })}
            >
              <SparklesIcon className="w-3 h-3" />
              Hub
            </button>
          </div>
        )}
        {/* Status Changes (Node completions/transitions) */}
        {hasStatusChanges && (
          <div className="px-3 py-2 space-y-1">
            {planUpdates.statusChanges!.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {change.to === 'completed' && (
                  <>
                    <CheckCircleIcon
                      className="h-4 w-4 shrink-0"
                      style={{ color: 'var(--color-success)' }}
                    />
                    <span className="font-medium" style={{ color: 'var(--color-success)' }}>
                      Completed: {change.nodeId}
                    </span>
                  </>
                )}
                {change.to === 'in_progress' && change.from === 'not_started' && (
                  <>
                    <ArrowTrendingUpIcon
                      className="h-4 w-4 shrink-0"
                      style={{
                        color:
                          'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)',
                      }}
                    />
                    <span
                      className="font-medium"
                      style={{
                        color:
                          'color-mix(in oklab, var(--color-accent-2) 80%, var(--color-fg) 20%)',
                      }}
                    >
                      Started: {change.nodeId}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Mastery Changes */}
        {hasMasteryChanges && (
          <div
            className="px-3 py-2 space-y-1"
            style={
              hasStatusChanges
                ? {
                    borderTop: '1px solid',
                    borderColor:
                      'color-mix(in oklab, var(--color-accent-2) 30%, var(--color-border))',
                  }
                : {}
            }
          >
            {planUpdates.masteryChanges!.map((change, idx) => {
              const increase = change.to > change.from;
              const delta = Math.abs(change.to - change.from);
              const percentFrom = Math.round(change.from * 100);
              const percentTo = Math.round(change.to * 100);

              return (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <ArrowTrendingUpIcon
                    className="h-4 w-4 shrink-0"
                    style={{ color: increase ? 'var(--color-success)' : 'var(--color-accent)' }}
                  />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{change.nodeId}</span> mastery:{' '}
                    {percentFrom}% → {percentTo}%
                    {increase && (
                      <span className="ml-1" style={{ color: 'var(--color-success)' }}>
                        (+{Math.round(delta * 100)}%)
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Expandable Learner Model Details */}
        {learnerModel && (
          <div
            style={
              hasAnyUpdates
                ? {
                    borderTop: '1px solid',
                    borderColor:
                      'color-mix(in oklab, var(--color-accent-2) 30%, var(--color-border))',
                  }
                : {}
            }
          >
            <button
              onClick={handleToggleDetails}
              className="w-full px-3 py-2 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>View learner model details</span>
              <ChevronDownIcon
                className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 text-xs space-y-2">
                {masteryEntries.length === 0 && (
                  <div className="text-muted-foreground">
                    Learner model does not have topic mastery data yet.
                  </div>
                )}

                {masteryEntries.map(([topicId, mastery]) => {
                  const confidence = Math.round((mastery.confidence ?? 0) * 100);
                  const label = mastery.nodeId || topicId;
                  const interactions = mastery.interactions ?? 0;
                  const confidenceColor =
                    confidence >= 70
                      ? 'color-mix(in oklab, var(--color-accent) 80%, var(--color-fg) 20%)'
                      : confidence >= 40
                        ? 'color-mix(in oklab, var(--color-accent-2) 70%, var(--color-fg) 30%)'
                        : 'color-mix(in oklab, var(--color-danger) 75%, var(--color-fg) 25%)';

                  const barColor =
                    confidence >= 70
                      ? 'color-mix(in oklab, var(--color-accent) 75%, transparent)'
                      : confidence >= 40
                        ? 'color-mix(in oklab, var(--color-accent-2) 70%, transparent)'
                        : 'color-mix(in oklab, var(--color-danger) 70%, transparent)';

                  return (
                    <div key={topicId} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-foreground">{label}</span>
                        <span style={{ color: confidenceColor }}>{confidence}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${confidence}%`, background: barColor }}
                        />
                      </div>
                      <div className="text-muted-foreground">
                        {interactions} interaction{interactions === 1 ? '' : 's'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
