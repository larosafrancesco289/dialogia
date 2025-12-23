'use client';
import { LearnerModel, LearningPlan } from '@/lib/types';
import {
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

export function LearnerStats({
  learnerModel,
  plan,
}: {
  learnerModel?: LearnerModel;
  plan: LearningPlan;
}) {
  const masteryEntries = learnerModel ? Object.values(learnerModel.mastery || {}) : [];

  // Calculate global stats
  const totalInteractions = masteryEntries.reduce((acc, m) => acc + (m.interactions || 0), 0);
  const avgConfidence = masteryEntries.length
    ? masteryEntries.reduce((acc, m) => acc + (m.confidence || 0), 0) / masteryEntries.length
    : 0;
  const masteredTopics = masteryEntries.filter((m) => (m.confidence || 0) >= 0.8).length;

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="p-3 rounded-xl border border-border bg-surface/50 space-y-1 shadow-sm">
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
          <SparklesIcon className="w-3.5 h-3.5 text-[var(--color-accent)]" />
          Mastery
        </div>
        <div className="text-xl font-bold text-foreground">{Math.round(avgConfidence * 100)}%</div>
      </div>

      <div className="p-3 rounded-xl border border-border bg-surface/50 space-y-1 shadow-sm">
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
          Topics
        </div>
        <div className="text-xl font-bold text-foreground">
          {masteredTopics}{' '}
          <span className="text-sm font-normal text-muted-foreground">/ {plan.nodes.length}</span>
        </div>
      </div>

      <div className="p-3 rounded-xl border border-border bg-surface/50 space-y-1 shadow-sm">
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
          <ClockIcon className="w-3.5 h-3.5 text-blue-500" />
          Activity
        </div>
        <div className="text-xl font-bold text-foreground">
          {totalInteractions}{' '}
          <span className="text-sm font-normal text-muted-foreground">interactions</span>
        </div>
      </div>
    </div>
  );
}

export function LearnerInsights({
  learnerModel,
  plan,
}: {
  learnerModel?: LearnerModel;
  plan: LearningPlan;
}) {
  if (!learnerModel) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-border bg-surface/30 text-xs text-muted-foreground text-center">
        No learning data yet. Start a lesson to track your progress!
      </div>
    );
  }

  // Filter for interesting topics: misconceptions, low confidence but started, or recently updated
  const interestingTopics = plan.nodes
    .filter((node) => {
      const m = learnerModel.mastery?.[node.id];
      if (!m) return false;
      const hasMisconceptions = m.misconceptions && m.misconceptions.length > 0;
      const isDeveloping = (m.confidence || 0) > 0 && (m.confidence || 0) < 0.7;
      return hasMisconceptions || isDeveloping;
    })
    .slice(0, 5); // Limit to top 5

  if (interestingTopics.length === 0) {
    return (
      <div className="p-4 rounded-lg border border-border bg-surface text-sm text-muted-foreground text-center">
        No specific insights yet. Start learning to generate data!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4" />
        Focus Areas & Insights
      </h3>

      <div className="space-y-3">
        {interestingTopics.map((node) => {
          const mastery = learnerModel.mastery?.[node.id];
          const confidence = mastery?.confidence || 0;
          const pct = Math.round(confidence * 100);

          return (
            <div
              key={node.id}
              className="p-3 rounded-lg border border-border bg-surface hover:bg-surface/80 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-semibold text-xs text-foreground">{node.name}</div>
                <div className="text-xs font-mono font-bold">{pct}%</div>
              </div>

              {/* Misconceptions */}
              {mastery?.misconceptions && mastery.misconceptions.length > 0 && (
                <div className="mt-2 text-[11px] p-2 rounded border bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 border-amber-200 dark:border-amber-800">
                  <strong>Misconception:</strong> {mastery.misconceptions[0].description}
                </div>
              )}

              {/* Recent Evidence (if no misconception) */}
              {(!mastery?.misconceptions || mastery.misconceptions.length === 0) &&
                mastery?.evidence && (
                  <div className="mt-2 text-[10px] text-muted-foreground line-clamp-2">
                    {mastery.evidence[mastery.evidence.length - 1].details}
                  </div>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function LearnerModelView({
  learnerModel,
  plan,
}: {
  learnerModel?: LearnerModel;
  plan: LearningPlan;
}) {
  // Fallback legacy view if used elsewhere, but reusing the new components
  return (
    <div className="space-y-6">
      <LearnerStats learnerModel={learnerModel} plan={plan} />
      <div className="h-px bg-border/50" />
      <LearnerInsights learnerModel={learnerModel} plan={plan} />
    </div>
  );
}
