import { useState } from 'react';
import type { LearningPlan, LearningPlanNode, TopicMastery } from '@/lib/types';
import { shownPercent, statusWords } from '@/modules/tutor/lib/topicStatus';
import { Meter, PathStep, stepState, waitingOn, type StepState } from './PlanPath';
import { Markdown } from '@/components/Markdown';
import { formatPercent } from '@/lib/i18n/format';
import { useT } from '@/modules/tutor/i18n';

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
 * one answer to "the chatbot or the buttons?". The percentages stay, as in the Hub.
 */
export function ReviseView({
  plan,
  mastery,
  revisions,
}: {
  plan: LearningPlan;
  /** Absent when the learner model is hidden. */
  mastery?: Record<string, TopicMastery>;
  revisions: PlanRevisions;
}) {
  const t = useT();
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
            mastery={mastery?.[node.id]}
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
        <p>{t('revise.hint')}</p>
        <button type="button" className="btn-outline btn-sm" onClick={revisions.onDiscuss}>
          {t('revise.ask')}
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
  mastery,
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
  mastery?: TopicMastery;
  busy: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onSkip: () => void;
  onStartNext: () => void;
  onReopen: () => void;
}) {
  const t = useT();
  const percent = shownPercent(state, mastery);

  return (
    <PathStep state={state} number={number}>
      <div className="hub-path__row is-static">
        <span className="hub-path__name">
          <Markdown inline content={node.name} />
        </span>
        {percent != null && <span className="hub-path__pct">{formatPercent(percent / 100)}</span>}
        <span className="hub-path__sub">
          {percent != null && <Meter value={mastery!.confidence} />}
          <span className="hub-path__status">
            <Markdown inline content={statusWords(state, false, waiting)} />
          </span>
        </span>
      </div>

      {confirming ? (
        <div className="hub-revise__actions">
          <span className="hub-revise__ask">{t('revise.confirm')}</span>
          <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={onSkip}>
            {t('revise.skip')}
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
            {t('common.cancel')}
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
              {t('revise.next')}
            </button>
          )}
          {(state === 'ready' || state === 'current') && (
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={busy}
              onClick={onConfirm}
            >
              {t('revise.known')}
            </button>
          )}
          {state === 'done' && (
            <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={onReopen}>
              {t('revise.reopen')}
            </button>
          )}
        </div>
      )}
    </PathStep>
  );
}
