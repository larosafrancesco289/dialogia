import { useEffect, useState } from 'react';
import type { LearningPlan, LearningPlanNode, TopicMastery } from '@/lib/types';
import { emptyTutorState, explainTopic, unmetPrerequisites } from '@/modules/tutor/engine';
import { inSentence } from '@/modules/tutor/ui/text';
import type { TutorAffordances } from '@/modules/tutor/ui/useTutorFlags';

const EVIDENCE_SHOWN = 4;

const pct = (value: number) => Math.round(value * 100);

// Below this an estimate backed by evidence is a weak spot worth seeing.
const WEAK = 0.4;

// Every topic starts at a prior; only evidence makes it a measurement.
const isMeasured = (m: TopicMastery | undefined): m is TopicMastery =>
  !!m && (m.interactions > 0 || m.evidence.length > 0);

/** The one definition of overall mastery: the mean over measured topics. */
export function measuredMastery(
  plan: LearningPlan,
  mastery?: Record<string, TopicMastery>,
): number | undefined {
  const values = plan.nodes
    .map((n) => mastery?.[n.id])
    .filter(isMeasured)
    .map((m) => m.confidence);
  return values.length ? values.reduce((sum, c) => sum + c, 0) / values.length : undefined;
}

// Corrections are recorded for the tutor ("Learner said…"); read them back
// to the learner in the second person.
const toLearner = (details: string) => details.replace(/^(Learner|Student) /, 'You ');

function Meter({ value, weak }: { value: number; weak: boolean }) {
  return (
    <span className={`hub-contents__meter${weak ? ' is-weak' : ''}`} aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }} />
    </span>
  );
}

export type ContentsCorrections = {
  onContestMastery: (nodeId: string, direction: 'up' | 'down') => Promise<unknown>;
  onResolveMisconception: (nodeId: string, misconceptionId: string) => Promise<unknown>;
};

/**
 * The Learning Hub at rest: the plan as a table of contents and the learner
 * model beside it. Reading comes first (the model as a reflective aid);
 * opening a topic shows why its estimate is what it is and, where the
 * learner may, a quiet way to correct it. Changing the plan lives in Revise.
 */
export function ContentsView({
  plan,
  mastery,
  affordances,
  corrections,
}: {
  plan: LearningPlan;
  mastery?: Record<string, TopicMastery>;
  affordances: TutorAffordances;
  corrections: ContentsCorrections;
}) {
  const currentId = plan.nodes.find((n) => n.status === 'in_progress')?.id ?? null;
  const [openId, setOpenId] = useState<string | null>(currentId);
  // When the plan moves on, the open topic follows it.
  useEffect(() => setOpenId(currentId), [currentId]);

  const done = plan.nodes.filter((n) => n.status === 'completed').length;
  const average = measuredMastery(plan, mastery);
  const hours = plan.metadata?.estimatedHours;
  const meta = [
    `${done} of ${plan.nodes.length} done`,
    affordances.showMastery && average != null ? `${pct(average)}% mastery` : null,
    hours != null ? `about ${hours}h in all` : null,
  ].filter(Boolean);

  return (
    <div className="hub-contents">
      <div className="hub-contents__intro">
        {plan.goal && <p className="hub-contents__goal">{plan.goal}</p>}
        <p className="hub-contents__meta">{meta.join(' · ')}</p>
      </div>

      <ol className="hub-contents__list">
        {plan.nodes.map((node, index) => (
          <ContentsItem
            key={node.id}
            node={node}
            number={index + 1}
            plan={plan}
            mastery={mastery?.[node.id]}
            affordances={affordances}
            corrections={corrections}
            open={openId === node.id}
            onToggle={() => setOpenId((prev) => (prev === node.id ? null : node.id))}
          />
        ))}
      </ol>
    </div>
  );
}

function ContentsItem({
  node,
  number,
  plan,
  mastery,
  affordances,
  corrections,
  open,
  onToggle,
}: {
  node: LearningPlanNode;
  number: number;
  plan: LearningPlan;
  mastery?: TopicMastery;
  affordances: TutorAffordances;
  corrections: ContentsCorrections;
  open: boolean;
  onToggle: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const locked = node.status === 'not_started' && unmetPrerequisites(plan, node).length > 0;
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
  const measured = isMeasured(mastery);
  const showMastery = affordances.showMastery && measured && !locked;
  // Being low on the topic in progress is expected; it stays the live one.
  const weak = showMastery && node.status !== 'in_progress' && mastery!.confidence < WEAK;
  const openMisconceptions = mastery?.misconceptions?.filter((m) => !m.resolved) ?? [];

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`hub-contents__item ${state}${!measured && state === 'is-ready' ? ' is-untouched' : ''}${open ? ' is-open' : ''}`}
    >
      <button type="button" className="hub-contents__row" aria-expanded={open} onClick={onToggle}>
        {node.status === 'completed' ? (
          <span className="hub-contents__num is-done" aria-label={`${number}, done`}>
            ✓
          </span>
        ) : (
          <span className="hub-contents__num">{number}</span>
        )}
        <span className="hub-contents__label">
          <span className="hub-contents__name">
            {node.name}
            {affordances.showMastery && openMisconceptions.length > 0 && (
              <span
                className="hub-contents__flag"
                title={`${openMisconceptions.length} open misconception${openMisconceptions.length === 1 ? '' : 's'}`}
              >
                ?
              </span>
            )}
          </span>
          {showMastery && <Meter value={mastery!.confidence} weak={weak} />}
          {locked && waitingOn.length > 0 && (
            <span className="hub-contents__after">After {waitingOn.join(' and ')}</span>
          )}
        </span>
        {showMastery && (
          <span className={`hub-contents__pct${weak ? ' is-weak' : ''}`}>
            {pct(mastery!.confidence)}
          </span>
        )}
      </button>

      {open && (
        <div className="hub-contents__detail">
          {node.description && <p className="hub-contents__desc">{node.description}</p>}
          {node.objectives.length > 0 && (
            <ul className="hub-contents__objectives">
              {node.objectives.map((objective, i) => (
                <li key={i}>{objective}</li>
              ))}
            </ul>
          )}

          {showMastery && <Why nodeId={node.id} mastery={mastery!} />}

          {showMastery && affordances.correctMastery && (
            <p className="hub-contents__correct">
              <span>Not how it feels?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => corrections.onContestMastery(node.id, 'down'))}
              >
                Too high
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void act(() => corrections.onContestMastery(node.id, 'up'))}
              >
                Too low
              </button>
            </p>
          )}

          {affordances.showMastery && openMisconceptions.length > 0 && (
            <div className="hub-contents__why">
              <p className="hub-contents__why-head">Still tangled</p>
              <ul>
                {openMisconceptions.map((m) => (
                  <li key={m.id} className="is-against">
                    <span className="hub-contents__sign" aria-hidden="true">
                      ?
                    </span>
                    <span>
                      {m.description}
                      {affordances.correctMastery && (
                        <button
                          type="button"
                          className="hub-contents__resolve"
                          disabled={busy}
                          onClick={() =>
                            void act(() => corrections.onResolveMisconception(node.id, m.id))
                          }
                        >
                          Resolved
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Where the estimate started and what each piece of evidence did to it. */
function Why({ nodeId, mastery }: { nodeId: string; mastery: TopicMastery }) {
  // B2: the Hub redesign reads `explainTopic` from the session state directly.
  const explanation = explainTopic(
    { ...emptyTutorState(), mastery: { [nodeId]: mastery } },
    nodeId,
  );
  const start = explanation?.start ?? mastery.confidence;
  const steps = (explanation?.steps ?? []).map((step) => ({
    ...step,
    evidence: mastery.evidence.find((entry) => entry.eventId === step.eventId),
  }));
  const newest = [...steps].reverse();
  const shown = newest.slice(0, EVIDENCE_SHOWN);
  const hidden = newest.length - shown.length;

  return (
    <div className="hub-contents__why">
      <p className="hub-contents__why-head">Why {pct(mastery.confidence)}%</p>
      <ul>
        {shown.map(({ evidence, before, after }, i) => {
          if (!evidence || typeof evidence.setTo === 'number') {
            return (
              <li key={i}>
                <span className="hub-contents__sign">=</span>
                <span>
                  Set to {pct(after)}% directly
                  {evidence && evidence.details ? `: ${toLearner(evidence.details)}` : ''}
                </span>
              </li>
            );
          }
          const delta = pct(after) - pct(before);
          return (
            <li key={i} className={delta < 0 ? 'is-against' : undefined}>
              <span className="hub-contents__sign">
                {delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0'}
              </span>
              <span>
                {evidence.type === 'self_report' ? toLearner(evidence.details) : evidence.details}
              </span>
            </li>
          );
        })}
        {hidden > 0 && <li className="hub-contents__more">and {hidden} earlier</li>}
        <li className="hub-contents__start">
          {mastery.baseline != null
            ? `Carried over at ${pct(start)}% from before`
            : `Started at ${pct(start)}%, before any evidence`}
        </li>
      </ul>
    </div>
  );
}
