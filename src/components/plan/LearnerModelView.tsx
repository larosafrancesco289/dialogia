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
      <div
        className="p-3 space-y-1"
        style={{
          background: 'var(--marginalia-bg)',
          border: '1px solid var(--rule-light)',
          borderLeft: '2px solid var(--color-accent)',
          borderRadius: 'var(--radius-editorial)',
        }}
      >
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
          <SparklesIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
          Mastery
        </div>
        <div className="text-xl font-bold text-foreground">{Math.round(avgConfidence * 100)}%</div>
      </div>

      <div
        className="p-3 space-y-1"
        style={{
          background: 'var(--marginalia-bg)',
          border: '1px solid var(--rule-light)',
          borderLeft: '2px solid var(--color-success)',
          borderRadius: 'var(--radius-editorial)',
        }}
      >
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
          <CheckCircleIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-success)' }} />
          Topics
        </div>
        <div className="text-xl font-bold text-foreground">
          {masteredTopics}{' '}
          <span className="text-sm font-normal text-muted-foreground">/ {plan.nodes.length}</span>
        </div>
      </div>

      <div
        className="p-3 space-y-1"
        style={{
          background: 'var(--marginalia-bg)',
          border: '1px solid var(--rule-light)',
          borderLeft: '2px solid var(--color-accent-2)',
          borderRadius: 'var(--radius-editorial)',
        }}
      >
        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
          <ClockIcon className="w-3.5 h-3.5" style={{ color: 'var(--color-accent-2)' }} />
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
      <div
        className="p-4 text-xs text-muted-foreground text-center"
        style={{
          background: 'var(--marginalia-bg)',
          border: '1px dashed var(--rule-light)',
          borderRadius: 'var(--radius-editorial)',
        }}
      >
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
      <div
        className="p-4 text-sm text-muted-foreground text-center"
        style={{
          background: 'var(--marginalia-bg)',
          border: '1px solid var(--rule-light)',
          borderRadius: 'var(--radius-editorial)',
        }}
      >
        No specific insights yet. Start learning to generate data!
      </div>
    );
  }

  return (
    <div
      className="marginalia p-4"
      style={{ borderLeftColor: 'var(--color-accent-2)' }}
    >
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2 mb-3">
        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
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
              className="p-3"
              style={{
                background: 'var(--surface-paper)',
                border: '1px solid var(--rule-light)',
                borderRadius: 'var(--radius-editorial)',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="font-semibold text-xs text-foreground">{node.name}</div>
                <div
                  className="text-[10px] font-mono font-bold px-1.5 py-0.5"
                  style={{
                    background: 'var(--marginalia-bg)',
                    border: '1px solid var(--rule-light)',
                    borderRadius: 'var(--radius-editorial)',
                  }}
                >
                  {pct}%
                </div>
              </div>

              {/* Misconceptions */}
              {mastery?.misconceptions && mastery.misconceptions.length > 0 && (
                <div
                  className="mt-2 text-[11px] p-2"
                  style={{
                    background: 'color-mix(in oklab, var(--color-danger) 10%, var(--surface-paper))',
                    border: '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--rule-light))',
                    borderRadius: 'var(--radius-editorial)',
                    color: 'var(--color-danger)',
                  }}
                >
                  <strong>Misconception:</strong> {mastery.misconceptions[0].description}
                </div>
              )}

              {/* Recent Evidence (if no misconception) */}
              {(!mastery?.misconceptions || mastery.misconceptions.length === 0) &&
                mastery?.evidence && (
                  <div className="mt-2 text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
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
      <div className="h-px" style={{ background: 'var(--rule-light)' }} />
      <LearnerInsights learnerModel={learnerModel} plan={plan} />
    </div>
  );
}
