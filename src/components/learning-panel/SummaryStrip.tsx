'use client';
import { useMemo } from 'react';
import type { LearnerModel, LearningPlan } from '@/lib/types';

export function SummaryStrip({
  learnerModel,
  plan,
}: {
  learnerModel?: LearnerModel;
  plan: LearningPlan;
}) {
  const stats = useMemo(() => {
    const entries = learnerModel ? Object.values(learnerModel.mastery ?? {}) : [];
    const avgConfidence = entries.length
      ? entries.reduce((sum, m) => sum + (m.confidence ?? 0), 0) / entries.length
      : 0;
    const mastered = entries.filter((m) => (m.confidence ?? 0) >= 0.7).length;
    return { avgConfidence, mastered, total: plan.nodes.length };
  }, [learnerModel, plan.nodes.length]);

  return (
    <div className="summary-strip">
      <div className="summary-stat">
        <span className="stat-value accent">{Math.round(stats.avgConfidence * 100)}%</span>
        <span className="stat-label">Mastery</span>
      </div>
      <div className="summary-stat">
        <span className="stat-value success">
          {stats.mastered}
          <span style={{ fontWeight: 400, color: 'var(--color-fg-subtle)' }}>/{stats.total}</span>
        </span>
        <span className="stat-label">Topics</span>
      </div>
      <div className="summary-stat">
        <span className="stat-value">{plan.nodes.length}</span>
        <span className="stat-label">Total</span>
      </div>
    </div>
  );
}
