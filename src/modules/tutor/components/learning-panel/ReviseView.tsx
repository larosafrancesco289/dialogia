import { useState } from 'react';
import type { LearningPlan, LearningPlanNode } from '@/lib/types';
import { isNodeReady } from '@/modules/tutor/learning-plan/service';
import { inSentence } from '@/modules/tutor/ui/text';

export type PlanRevisions = {
  onSkip: (nodeId: string) => Promise<unknown> | void;
  onStartNext: (nodeId: string) => Promise<unknown> | void;
  onReopen: (nodeId: string) => Promise<unknown> | void;
  onDiscuss: () => void;
};

/**
 * Revise plan: the plan's own negotiation, and only the plan. Each topic
 * offers what the learner can change directly (skip what they know, choose
 * what comes next, reopen what they want back); anything structural goes to
 * the tutor, and the view says so, so there is one answer to "the chatbot
 * or the buttons?".
 */
export function ReviseView({ plan, revisions }: { plan: LearningPlan; revisions: PlanRevisions }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (nodeId: string, fn: () => Promise<unknown> | void) => {
    setBusy(nodeId);
    try {
      await fn();
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  };

  return (
    <div className="hub-contents hub-revise">
      <p className="hub-revise__lead">
        Skip what you already know, choose what comes next, or take a finished topic up again.
      </p>

      <ol className="hub-contents__list">
        {plan.nodes.map((node, index) => (
          <ReviseItem
            key={node.id}
            node={node}
            number={index + 1}
            plan={plan}
            busy={busy === node.id}
            confirming={confirming === node.id}
            onConfirm={() => setConfirming(node.id)}
            onCancel={() => setConfirming(null)}
            onSkip={() => void run(node.id, () => revisions.onSkip(node.id))}
            onStartNext={() => void run(node.id, () => revisions.onStartNext(node.id))}
            onReopen={() => void run(node.id, () => revisions.onReopen(node.id))}
          />
        ))}
      </ol>

      <div className="hub-revise__discuss">
        <p>To add, remove or reorder topics, talk it through with the tutor.</p>
        <button type="button" className="hub-revise__action" onClick={revisions.onDiscuss}>
          Discuss the plan with the tutor
        </button>
      </div>
    </div>
  );
}

function ReviseItem({
  node,
  number,
  plan,
  busy,
  confirming,
  onConfirm,
  onCancel,
  onSkip,
  onStartNext,
  onReopen,
}: {
  node: LearningPlanNode;
  number: number;
  plan: LearningPlan;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSkip: () => void;
  onStartNext: () => void;
  onReopen: () => void;
}) {
  const locked = node.status === 'not_started' && !isNodeReady(node.id, plan);
  const ready = node.status === 'not_started' && !locked;
  const state =
    node.status === 'in_progress'
      ? 'is-current'
      : node.status === 'completed'
        ? 'is-done'
        : locked
          ? 'is-locked'
          : 'is-ready';
  const waitingOn = locked
    ? plan.nodes
        .filter((p) => node.prerequisites.includes(p.id) && p.status !== 'completed')
        .map((p) => inSentence(p.name))
    : [];

  return (
    <li className={`hub-contents__item ${state}`}>
      <div className="hub-contents__row hub-revise__row">
        {node.status === 'completed' ? (
          <span className="hub-contents__num is-done" aria-label={`${number}, done`}>
            ✓
          </span>
        ) : (
          <span className="hub-contents__num">{number}</span>
        )}
        <span className="hub-contents__label">
          <span className="hub-contents__name">{node.name}</span>
          {node.status === 'in_progress' && (
            <span className="hub-contents__after">In progress</span>
          )}
          {locked && waitingOn.length > 0 && (
            <span className="hub-contents__after">After {waitingOn.join(' and ')}</span>
          )}
        </span>
      </div>

      {confirming ? (
        <div className="hub-revise__confirm">
          <span>Mark it done and move on?</span>
          <button type="button" className="hub-revise__action" disabled={busy} onClick={onSkip}>
            Skip it
          </button>
          <button type="button" className="hub-revise__link" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="hub-revise__actions">
          {ready && (
            <button
              type="button"
              className="hub-revise__link"
              disabled={busy}
              onClick={onStartNext}
            >
              Do this next
            </button>
          )}
          {(ready || node.status === 'in_progress') && (
            <button type="button" className="hub-revise__link" disabled={busy} onClick={onConfirm}>
              I know this
            </button>
          )}
          {node.status === 'completed' && (
            <button type="button" className="hub-revise__link" disabled={busy} onClick={onReopen}>
              Take it up again
            </button>
          )}
        </div>
      )}
    </li>
  );
}
