import { useMemo } from 'react';
import type { LearnerModel, LearningPlan } from '@/lib/types';
import { isNodeReady } from '@/modules/tutor/learning-plan/service';

function masteryColor(confidence: number) {
  if (confidence >= 0.7) return 'var(--color-success)';
  if (confidence >= 0.4) return 'var(--color-accent)';
  return 'var(--color-danger)';
}

export function SummaryStrip({
  learnerModel,
  plan,
  learnerModelVisible,
}: {
  learnerModel?: LearnerModel;
  plan: LearningPlan;
  learnerModelVisible?: boolean;
}) {
  const stats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    for (const n of plan.nodes) {
      if (n.status === 'completed') completed++;
      else if (n.status === 'in_progress') inProgress++;
    }
    const total = plan.nodes.length;
    const estHours = plan.metadata?.estimatedHours;

    const entries = learnerModel ? Object.values(learnerModel.mastery ?? {}) : [];
    const avgConfidence = entries.length
      ? entries.reduce((sum, m) => sum + (m.confidence ?? 0), 0) / entries.length
      : 0;

    // Per-node mastery for heat strip
    const heatData = plan.nodes.map((n) => {
      const m = learnerModel?.mastery?.[n.id];
      const locked = n.status === 'not_started' && !isNodeReady(n.id, plan);
      return {
        id: n.id,
        name: n.name,
        confidence: m?.confidence ?? 0,
        locked,
      };
    });

    return { completed, inProgress, total, estHours, avgConfidence, heatData };
  }, [learnerModel, plan]);

  const progressPct = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  if (learnerModelVisible) {
    // Condition B: mastery + heat strip
    return (
      <div className="plan-summary">
        <div className="plan-summary__text">
          <span className="plan-summary__hl">{Math.round(stats.avgConfidence * 100)}%</span> mastery
          <span className="plan-summary__dot">&middot;</span>
          <strong>{stats.inProgress}</strong> of <strong>{stats.total}</strong> in progress
          {stats.estHours != null && (
            <>
              <span className="plan-summary__dot">&middot;</span>~{stats.estHours}h left
            </>
          )}
        </div>
        <div className="plan-heat-strip">
          {stats.heatData.map((d) => (
            <div
              key={d.id}
              className="plan-heat-strip__seg"
              style={{
                background: d.locked ? 'var(--rule-light)' : masteryColor(d.confidence),
                opacity: d.locked ? 1 : Math.max(0.4, d.confidence),
              }}
            >
              <span className="plan-heat-strip__tip">
                {d.name} {d.locked ? '\u2014' : `${Math.round(d.confidence * 100)}%`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Condition A: simple progress bar
  return (
    <div className="plan-summary">
      <div className="plan-summary__text">
        <strong>{stats.inProgress}</strong> of <strong>{stats.total}</strong> topics in progress
        {stats.estHours != null && (
          <>
            <span className="plan-summary__dot">&middot;</span>~{stats.estHours}h total
          </>
        )}
      </div>
      <div className="plan-prog-track">
        <div className="plan-prog-fill" style={{ transform: `scaleX(${progressPct / 100})` }} />
      </div>
      <div className="plan-prog-labels">
        <span>{stats.completed} completed</span>
        <span>{stats.total} topics</span>
      </div>
    </div>
  );
}
