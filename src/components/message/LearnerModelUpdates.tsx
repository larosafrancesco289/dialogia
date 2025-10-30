'use client';
import { CheckCircleIcon, ArrowTrendingUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { Message, LearnerModel, TopicMastery } from '@/lib/types';
import { useState } from 'react';

export function LearnerModelUpdates({ message }: { message: Message }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { planUpdates, learnerModel } = message;
  const masteryEntries: Array<[string, TopicMastery]> = learnerModel
    ? (Object.entries(learnerModel.mastery ?? {}) as Array<[string, TopicMastery]>)
    : [];

  // Only show if there are updates or learner model data
  if (!planUpdates && !learnerModel) return null;

  const hasStatusChanges = planUpdates?.statusChanges && planUpdates.statusChanges.length > 0;
  const hasMasteryChanges = planUpdates?.masteryChanges && planUpdates.masteryChanges.length > 0;
  const hasAnyUpdates = hasStatusChanges || hasMasteryChanges;

  if (!hasAnyUpdates && !learnerModel) return null;

  return (
    <div className="px-4 pb-3">
      <div className="rounded-lg border border-blue-500/20 bg-blue-500/5">
        {/* Status Changes (Node completions/transitions) */}
        {hasStatusChanges && (
          <div className="px-3 py-2 space-y-1">
            {planUpdates.statusChanges!.map((change, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {change.to === 'completed' && (
                  <>
                    <CheckCircleIcon className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-green-700 dark:text-green-400 font-medium">
                      Completed: {change.nodeId}
                    </span>
                  </>
                )}
                {change.to === 'in_progress' && change.from === 'not_started' && (
                  <>
                    <ArrowTrendingUpIcon className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-blue-700 dark:text-blue-400 font-medium">
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
          <div className={`px-3 py-2 space-y-1 ${hasStatusChanges ? 'border-t border-blue-500/20' : ''}`}>
            {planUpdates.masteryChanges!.map((change, idx) => {
              const increase = change.to > change.from;
              const delta = Math.abs(change.to - change.from);
              const percentFrom = Math.round(change.from * 100);
              const percentTo = Math.round(change.to * 100);

              return (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <ArrowTrendingUpIcon
                    className={`h-4 w-4 shrink-0 ${increase ? 'text-green-500' : 'text-orange-500'}`}
                  />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{change.nodeId}</span>
                    {' '}mastery: {percentFrom}% → {percentTo}%
                    {increase && (
                      <span className="text-green-600 dark:text-green-400 ml-1">
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
          <div className={`${hasAnyUpdates ? 'border-t border-blue-500/20' : ''}`}>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
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
