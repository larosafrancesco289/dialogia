'use client';
import { CheckCircleIcon, ArrowTrendingUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { Message, LearnerModel } from '@/lib/types';
import { useState } from 'react';

export function LearnerModelUpdates({ message }: { message: Message }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { planUpdates, learnerModel } = message;

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
                {Object.entries(learnerModel).map(([topic, mastery]) => {
                  if (typeof mastery === 'object' && mastery !== null && 'confidence' in mastery) {
                    const m = mastery as any;
                    const confidence = Math.round((m.confidence || 0) * 100);

                    return (
                      <div key={topic} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{topic}</span>
                          <span className={`${confidence >= 70 ? 'text-green-600 dark:text-green-400' : confidence >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'}`}>
                            {confidence}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${confidence >= 70 ? 'bg-green-500' : confidence >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${confidence}%` }}
                          />
                        </div>
                        {m.interactions !== undefined && (
                          <div className="text-muted-foreground">
                            {m.interactions} interaction{m.interactions !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
