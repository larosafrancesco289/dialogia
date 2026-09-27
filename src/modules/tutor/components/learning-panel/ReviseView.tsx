import { useState } from 'react';
import type { LearningPlan, LearningPlanNode } from '@/lib/types';
import { listNames, PathStep, stepState, waitingOn, type StepState } from './PlanPath';
import { InlineEmphasis } from '@/modules/tutor/components/message/InlineEmphasis';

export type PlanRevisions = {
  onSkip: (nodeId: string) => Promise<unknown> | void;
  onStartNext: (nodeId: string) => Promise<unknown> | void;
  onReopen: (nodeId: string) => Promise<unknown> | void;
  onDiscuss: () => void;
};

/**
 * Edit plan: the plan's own negotiation, and only the plan. The same path as
 * the Hub, with what the learner can change directly under each topic (skip
 * what they know, choose what comes next, take a finished one up again);
 * anything structural goes to the tutor, and the view says so, so there is
 * one answer to "the chatbot or the buttons?".
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
    <div className="hub-contents">
      <ol className="hub-path">
        {plan.nodes.map((node, index) => (
          <ReviseItem
            key={node.id}
            node={node}
            number={index + 1}
            state={stepState(plan, node)}
            waiting={waitingOn(plan, node)}
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
        <p>To add, remove or reorder topics, ask the tutor.</p>
        <button type="button" className="btn-outline btn-sm" onClick={revisions.onDiscuss}>
          Ask the tutor for changes
        </button>
      </div>
    </div>
  );
}

function ReviseItem({
  node,
  number,
  state,
  waiting,
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
  state: StepState;
  waiting: string[];
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSkip: () => void;
  onStartNext: () => void;
  onReopen: () => void;
}) {
  const status =
    state === 'done'
      ? 'Done'
      : state === 'current'
        ? 'In progress'
        : state === 'locked'
          ? `Starts after ${listNames(waiting)}`
          : 'Not started';

  return (
    <PathStep state={state} number={number}>
      <div className="hub-path__row is-static">
        <span className="hub-path__name">
          <InlineEmphasis text={node.name} />
        </span>
        <span className="hub-path__sub">
          <span className="hub-path__status">
            <InlineEmphasis text={status} />
          </span>
        </span>
      </div>

      {confirming ? (
        <div className="hub-revise__actions">
          <span className="hub-revise__ask">Mark it done and move on?</span>
          <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={onSkip}>
            Skip it
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="hub-revise__actions">
          {state === 'ready' && (
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={busy}
              onClick={onStartNext}
            >
              Do this next
            </button>
          )}
          {(state === 'ready' || state === 'current') && (
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={busy}
              onClick={onConfirm}
            >
              I know this
            </button>
          )}
          {state === 'done' && (
            <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={onReopen}>
              Take it up again
            </button>
          )}
        </div>
      )}
    </PathStep>
  );
}
